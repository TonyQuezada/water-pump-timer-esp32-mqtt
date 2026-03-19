"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

// ========== TYPES ==========
interface DeviceStatus {
  mode:             number;
  isRunning:        boolean;
  remainingSeconds: number;
  hourIndicator:    number;
}

interface FlowData {
  lph: number;
}

interface LogEntry {
  id:        number;
  timestamp: string;
  source:    "physical" | "web";
  action:    string;
  detail:    string | null;
  username:  string | null;
}

interface Props {
  username: string;
  role:     "admin" | "user";
}

// ========== HELPERS ==========
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatRemaining(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${pad(h)}:${pad(m)}`;
}

// ========== COMPONENT ==========
export default function PumpControl({ username, role }: Props) {
  const [status,    setStatus]    = useState<DeviceStatus | null>(null);
  const [flow,      setFlow]      = useState<FlowData | null>(null);
  const [connected, setConnected] = useState(false);
  const [toast,     setToast]     = useState<string | null>(null);
  const [logs,      setLogs]      = useState<LogEntry[]>([]);

  // ---- SSE ----
  useEffect(() => {
    const source = new EventSource("/api/mqtt");

    source.addEventListener("status", (e) => {
      setStatus(JSON.parse(e.data));
      setConnected(true);
    });

    source.addEventListener("flow", (e) => {
      setFlow(JSON.parse(e.data));
    });

    source.addEventListener("connected", () => {
      setConnected(true);
    });

    source.onerror = () => setConnected(false);

    return () => source.close();
  }, []);

  // ---- Poll logs every 10 seconds (admin only) ----
  useEffect(() => {
    if (role !== "admin") return;

    function fetchLogs() {
      fetch("/api/logs")
        .then((r) => r.json())
        .then((data) => setLogs(data.logs ?? []));
    }

    fetchLogs();
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, [role]);

  // ---- Helpers ----
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function sendCommand(button: string, hours?: number) {
    await fetch("/api/mqtt", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(hours !== undefined ? { button, hours } : { button }),
    });
  }

  async function handleHourButton(h: number) {
    await sendCommand("ok", h);
    showToast(`Bomba activada por ${h} ${h === 1 ? "hora" : "horas"}`);
  }

  async function handleOff() {
    await sendCommand("off");
    showToast("Bomba apagada");
  }

  async function handleLogout() {
    await signOut({ callbackUrl: "/login" });
  }

  // ---- Derived state ----
  const isOn         = status?.mode === 1;
  const selectedHour = status ? status.hourIndicator + 1 : null;

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center px-4 py-10">

      {/* ── HEADER ── */}
      <div className="w-full max-width flex items-center gap-3 mb-8">
        <span className={`w-2.5 h-2.5 rounded-full ${connected ? "bg-cyan-400 animate-pulse" : "bg-gray-600"}`} />
        <h1 className="font-mono text-cyan-400 tracking-widest text-sm uppercase">
          Control Bomba
        </h1>
        <span className={`ml-auto text-xs font-mono px-3 py-1 rounded-full border ${
          isOn
            ? "border-green-400 text-green-400"
            : "border-gray-600 text-gray-500"
        }`}>
          {!connected ? "OFFLINE" : isOn ? "ACTIVO" : "EN ESPERA"}
        </span>
      </div>

      {/* ── USER BAR ── */}
      <div className="w-full max-width flex items-center justify-between mb-6">
        <span className="text-xs font-mono text-gray-500">
          {username}
          {role === "admin" && (
            <span className="ml-2 text-cyan-600">[admin]</span>
          )}
        </span>
        <button
          onClick={handleLogout}
          className="text-xs font-mono text-gray-600 hover:text-red-400 transition-colors"
        >
          Cerrar sesión →
        </button>
      </div>

      {/* ── STATS ROW ── */}
      <div className="w-full max-width grid grid-cols-2 gap-3 mb-6">
        <Card label="Tiempo restante" unit="HH:MM">
          <span className="font-mono text-4xl text-cyan-400">
            {status?.isRunning ? formatRemaining(status.remainingSeconds) : "--:--"}
          </span>
        </Card>
        <Card label="Flujo actual" unit="L / hora">
          <span className="font-mono text-4xl text-cyan-400">
            {flow ? flow.lph.toFixed(1) : "0.0"}
          </span>
        </Card>
      </div>

      {/* ── HOUR GRID ── */}
      <p className="w-full max-width text-xs font-mono text-gray-500 tracking-widest uppercase mb-3">
        // Seleccionar duración
      </p>
      <div className="w-full max-width grid grid-cols-3 gap-3 mb-4">
        {Array.from({ length: 6 }, (_, i) => i + 1).map((h) => (
          <button
            key={h}
            onClick={() => handleHourButton(h)}
            className={`flex flex-col items-center py-4 rounded-xl border font-mono transition-all duration-150
              ${selectedHour === h && isOn
                ? "border-green-400 text-green-400 shadow-[0_0_12px_rgba(74,222,128,0.4)]"
                : "border-gray-700 text-gray-300 hover:border-cyan-500 hover:text-cyan-400 hover:shadow-[0_0_10px_rgba(34,211,238,0.3)]"
              } active:scale-95`}
          >
            <span className="text-xl">{h}</span>
            <span className="text-xs text-gray-500 tracking-widest">
              {h === 1 ? "HORA" : "HORAS"}
            </span>
          </button>
        ))}
      </div>

      {/* ── OFF BUTTON ── */}
      <button
        onClick={handleOff}
        disabled={!isOn}
        className="w-full max-width py-4 rounded-xl border border-red-600 text-red-500
          font-mono text-sm tracking-widest uppercase transition-all duration-150
          hover:bg-red-950 hover:shadow-[0_0_12px_rgba(239,68,68,0.3)]
          disabled:opacity-30 disabled:cursor-not-allowed
          active:scale-98"
      >
        ■ Apagar bomba
      </button>

      {/* ── ADMIN LOG PANEL ── */}
      {role === "admin" && (
        <div className="w-full max-width mt-8">
          <p className="text-xs font-mono text-gray-500 tracking-widest uppercase mb-3">
            // Registro de eventos
          </p>
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-cyan-500/40 to-transparent" />
            <div className="max-h-72 overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-xs font-mono text-gray-600 p-4">
                  No hay eventos registrados.
                </p>
              ) : (
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-500">
                      <th className="text-left px-4 py-2">Timestamp</th>
                      <th className="text-left px-4 py-2">Fuente</th>
                      <th className="text-left px-4 py-2">Acción</th>
                      <th className="text-left px-4 py-2">Detalle</th>
                      <th className="text-left px-4 py-2">Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{new Date(log.timestamp + 'Z').toLocaleString('es-MX')}</td>
                        <td className="px-4 py-2">
                          <span className={log.source === "physical" ? "text-yellow-500" : "text-cyan-500"}>
                            {log.source}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-300">{log.action}</td>
                        <td className="px-4 py-2 text-gray-500">{log.detail ?? "—"}</td>
                        <td className="px-4 py-2 text-gray-500">{log.username ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 border border-cyan-500 text-cyan-400 font-mono text-xs tracking-wider px-5 py-3 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}

// ========== CARD ==========
function Card({ label, unit, children }: { label: string; unit: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 flex flex-col gap-1 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-cyan-500/40 to-transparent" />
      <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">{label}</span>
      {children}
      <span className="text-xs font-mono text-gray-600">{unit}</span>
    </div>
  );
}