"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const from         = searchParams.get("from") || "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Credenciales incorrectas.");
      return;
    }

    window.location.href = from;
  }

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* ── HEADER ── */}
        <div className="flex items-center gap-3 mb-8">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          <h1 className="font-mono text-cyan-400 tracking-widest text-sm uppercase">
            Control Bomba
          </h1>
        </div>

        {/* ── FORM ── */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-cyan-500/40 to-transparent" />

          <h2 className="font-mono text-gray-300 text-sm tracking-widest uppercase mb-6">
            // Iniciar sesión
          </h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-mono text-gray-500 uppercase tracking-widest">
                Usuario
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                className="bg-gray-950 border border-gray-700 rounded-lg px-4 py-3
                  font-mono text-sm text-gray-100 outline-none
                  focus:border-cyan-500 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-mono text-gray-500 uppercase tracking-widest">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="bg-gray-950 border border-gray-700 rounded-lg px-4 py-3
                  font-mono text-sm text-gray-100 outline-none
                  focus:border-cyan-500 transition-colors"
              />
            </div>

            {error && (
              <p className="text-xs font-mono text-red-400 border border-red-900 bg-red-950/50 rounded-lg px-4 py-3">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 py-3 rounded-xl border border-cyan-600 text-cyan-400
                font-mono text-sm tracking-widest uppercase transition-all duration-150
                hover:bg-cyan-950 hover:shadow-[0_0_12px_rgba(34,211,238,0.2)]
                disabled:opacity-50 disabled:cursor-not-allowed
                active:scale-98"
            >
              {loading ? "Verificando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
