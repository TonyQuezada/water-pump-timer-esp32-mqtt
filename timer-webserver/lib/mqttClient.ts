import mqtt, { MqttClient } from "mqtt";

// ========== TOPICS ==========
export const TOPICS = {
  deviceStatus: "waterpump/device/status",
  deviceFlow:   "waterpump/device/flow",
  deviceButton: "waterpump/device/button",
  controlButton:"waterpump/control/button",
} as const;

// ========== SINGLETON ==========
// Next.js hot-reloads modules in dev, so we attach the client to the
// global object to prevent creating multiple connections on every reload.
declare global {
  // eslint-disable-next-line no-var
  var _mqttClient: MqttClient | undefined;
}

function createClient(): MqttClient {
  const brokerUrl = `mqtt://${process.env.MQTT_HOST}:${process.env.MQTT_PORT}`;

  const client = mqtt.connect(brokerUrl, {
    username:    process.env.MQTT_USER,
    password:    process.env.MQTT_PASSWORD,
    clientId:    "waterpump-nextjs",
    clean:       true,
    reconnectPeriod: 3000, // retry every 3 seconds if broker drops
  });

  client.on("connect", () => {
    console.log("[MQTT] Connected to broker");
    client.subscribe([
      TOPICS.deviceStatus,
      TOPICS.deviceFlow,
      TOPICS.deviceButton,
    ]);
  });

  client.on("error", (err) => {
    console.error("[MQTT] Error:", err.message);
  });

  client.on("close", () => {
    console.warn("[MQTT] Connection closed");
  });

  return client;
}

export function getMqttClient(): MqttClient {
  if (!global._mqttClient || !global._mqttClient.connected) {
    global._mqttClient = createClient();
  }
  return global._mqttClient;
}
