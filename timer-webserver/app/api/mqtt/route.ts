import { NextRequest, NextResponse } from "next/server";
import { getMqttClient, TOPICS } from "@/lib/mqttClient";
import { logQueries } from "@/lib/db";
import { auth } from "@/lib/auth";

// ========== SSE CLIENTS ==========
const clients = new Set<ReadableStreamDefaultController>();

function broadcast(event: string, data: string) {
  const message = `event: ${event}\ndata: ${data}\n\n`;
  clients.forEach((controller) => {
    try {
      controller.enqueue(message);
    } catch {
      clients.delete(controller);
    }
  });
}

// ========== MQTT → SSE BRIDGE ==========
let bridgeInitialized = false;

function initBridge() {
  if (bridgeInitialized) return;
  bridgeInitialized = true;

  const mqtt = getMqttClient();

  mqtt.on("message", (topic, payload) => {
    const data = payload.toString();

    if (topic === TOPICS.deviceStatus) {
      broadcast("status", data);
    } else if (topic === TOPICS.deviceFlow) {
      broadcast("flow", data);
    } else if (topic === TOPICS.deviceButton) {
      broadcast("button", data);

      try {
        const parsed = JSON.parse(data);
        logQueries.insert.run(
          "physical",
          `button_${parsed.button}`,
          parsed.hours ? `hours:${parsed.hours}` : null,
          null
        );
      } catch {
        console.error("[LOG] Failed to parse device button payload:", data);
      }
    }
  });
}

// ========== GET — SSE STREAM ==========
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  initBridge();

  const stream = new ReadableStream({
    start(controller) {
      clients.add(controller);
      controller.enqueue("event: connected\ndata: {}\n\n");
    },
    cancel(controller) {
      clients.delete(controller);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":                "text/event-stream",
      "Cache-Control":               "no-cache",
      "Connection":                  "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ========== POST — PUBLISH CONTROL COMMANDS ==========
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { button, hours } = body;

  if (!button) {
    return NextResponse.json({ error: "Missing button field" }, { status: 400 });
  }

  const payload =
    hours !== undefined
      ? JSON.stringify({ button, hours })
      : JSON.stringify({ button });

  const mqtt = getMqttClient();
  mqtt.publish(TOPICS.controlButton, payload);

  logQueries.insert.run(
    "web",
    `button_${button}`,
    hours ? `hours:${hours}` : null,
    session.user.name ?? "unknown"
  );

  return NextResponse.json({ ok: true });
}