import { useState } from "react";
import { authenticateUser } from "../lib/tauri";
import { branding } from "../config/branding";
import type { User } from "../types";

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const showVendor = branding.vendor !== branding.companyName;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const user = await authenticateUser(username, password);
      onLoginSuccess(user);
    } catch (err) {
      setError(typeof err === "string" ? err : "Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      {/* Placa de equipo: la identidad, tratada como la chapa de una máquina */}
      <div className="flex items-center justify-center bg-navy-900 p-8 md:p-12">
        <div className="w-full max-w-sm border border-navy-600/50 p-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brass-400">
            {branding.tagline}
          </p>
          <h1 className="mt-4 text-4xl font-extrabold uppercase leading-none tracking-tight text-white">
            {branding.companyName}
          </h1>
          <div className="mt-6 h-px bg-navy-600/50" />
          <dl className="mt-4 space-y-1.5 font-mono text-[11px] uppercase tracking-wider text-navy-300">
            <div className="flex justify-between">
              <dt>Versión</dt>
              <dd className="text-navy-100">2.0</dd>
            </div>
            <div className="flex justify-between">
              <dt>Modo</dt>
              <dd className="text-navy-100">Local</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Panel de acceso: plano, con inputs de línea inferior */}
      <div className="flex items-center justify-center bg-[#eceef1] p-8 md:p-12">
        <form onSubmit={handleSubmit} className="w-full max-w-xs">
          <h2 className="mb-8 font-mono text-xs uppercase tracking-[0.3em] text-gray-500">
            Login
          </h2>

          <div className="mb-6">
            <label
              htmlFor="username"
              className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-gray-500"
            >
              Usuario
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              disabled={loading}
              required
              className="w-full border-0 border-b-2 border-gray-300 bg-transparent py-2 text-navy-900 focus:border-navy-900 focus:outline-none disabled:opacity-50"
            />
          </div>

          <div className="mb-6">
            <label
              htmlFor="password"
              className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-gray-500"
            >
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
              className="w-full border-0 border-b-2 border-gray-300 bg-transparent py-2 text-navy-900 focus:border-navy-900 focus:outline-none disabled:opacity-50"
            />
          </div>

          {error && (
            <p className="mb-6 border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error === "Invalid credentials"
                ? "Usuario o contraseña incorrectos"
                : error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-navy-900 py-3 font-mono text-sm uppercase tracking-widest text-white transition-colors hover:bg-navy-800 disabled:bg-gray-400"
          >
            {loading ? "Verificando…" : "Entrar"}
          </button>

          {showVendor && (
            <p className="mt-10 font-mono text-[11px] uppercase tracking-wider text-gray-400">
              Desarrollado por {branding.vendor}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
