import { useCallback, useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { getRouteSummary } from "../lib/tauri";
import type { Route, RouteSummary as RouteSummaryData } from "../types";

interface RouteSummaryProps {
  route: Route;
  onBack: () => void;
}

// Mismo formato de moneda que el detalle de máquina (ej: 10,000)
const fmt = (n: number) =>
  n.toLocaleString("es-CO", { maximumFractionDigits: 2 });

const iso = (d: Date) => {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

// Período por defecto: el mes en curso, del día 1 al último
const monthStart = () => {
  const d = new Date();
  return iso(new Date(d.getFullYear(), d.getMonth(), 1));
};
const monthEnd = () => {
  const d = new Date();
  return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};

export default function RouteSummary({ route, onBack }: RouteSummaryProps) {
  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(monthEnd);
  const [summary, setSummary] = useState<RouteSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (from: string, to: string) => {
      setLoading(true);
      setError("");
      try {
        setSummary(await getRouteSummary(route.routeId, from, to));
      } catch (err) {
        setSummary(null);
        setError(typeof err === "string" ? err : "Error cargando el resumen");
      } finally {
        setLoading(false);
      }
    },
    [route.routeId]
  );

  // Consulta automática al entrar (y si se cambia de ruta)
  useEffect(() => {
    load(monthStart(), monthEnd());
  }, [load]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    load(fromDate, toDate);
  };

  // Las máquinas sin liquidar van al final, sin alterar el orden por número
  const machines = summary
    ? [
        ...summary.machines.filter((m) => m.liquidated),
        ...summary.machines.filter((m) => !m.liquidated),
      ]
    : [];

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-navy-900">
            Resumen · {route.routeName}
          </h2>
          <p className="text-gray-500 text-sm">
            Liquidaciones sumadas por máquina en el período
          </p>
        </div>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
        >
          <ChevronLeft size={16} />
          Volver
        </button>
      </div>

      {/* Filtros */}
      <form onSubmit={handleSubmit} className="flex items-end gap-3 mb-6">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Desde
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            required
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Hasta
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            required
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-navy-900 text-white px-4 py-2 rounded-md font-medium text-sm hover:bg-navy-800 transition-colors disabled:bg-gray-400"
        >
          {loading ? "Consultando..." : "Consultar"}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Cargando resumen...</p>
      ) : summary ? (
        <>
          {/* Totales del período */}
          <div className="grid grid-cols-4 gap-4 mb-2">
            <div
              className={`rounded-lg border p-4 ${
                summary.totalFaltaSobra < 0
                  ? "bg-red-50 border-red-200"
                  : "bg-green-50 border-green-200"
              }`}
            >
              <p
                className={`text-xs font-medium mb-1 ${
                  summary.totalFaltaSobra < 0 ? "text-red-700" : "text-green-700"
                }`}
              >
                Falta/Sobra
              </p>
              <p
                className={`text-2xl font-bold ${
                  summary.totalFaltaSobra < 0 ? "text-red-700" : "text-green-700"
                }`}
              >
                {summary.totalFaltaSobra > 0 ? "+" : ""}
                {fmt(summary.totalFaltaSobra)}
              </p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 mb-1">
                Total entregado
              </p>
              <p className="text-2xl font-bold text-navy-900">
                {fmt(summary.totalDelivered)}
              </p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 mb-1">
                Saldo total
              </p>
              <p className="text-2xl font-bold text-navy-900">
                {fmt(summary.totalSaldo)}
              </p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 mb-1">
                IN-OUT total
              </p>
              <p className="text-2xl font-bold text-navy-900">
                {fmt(summary.totalInOut)}
              </p>
            </div>
          </div>

          <p className="text-sm text-gray-500 mb-6">
            {summary.machinesLiquidated} de {summary.machinesTotal} máquinas
            liquidadas en el período
          </p>

          {/* Detalle por máquina */}
          {machines.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-lg">Esta ruta no tiene máquinas</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-navy-900 text-white text-left">
                    <th className="px-4 py-3 font-medium">Número</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium text-right">IN-OUT</th>
                    <th className="px-4 py-3 font-medium text-right">Total</th>
                    <th className="px-4 py-3 font-medium text-right">Saldo</th>
                    <th className="px-4 py-3 font-medium text-right">
                      Falta/Sobra
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {machines.map((m) => (
                    <tr
                      key={m.machineId}
                      className={`border-t border-gray-100 ${
                        m.liquidated ? "text-gray-700" : "text-gray-400"
                      }`}
                    >
                      <td
                        className={`px-4 py-3 font-medium ${
                          m.liquidated ? "text-navy-900" : "text-gray-400"
                        }`}
                      >
                        {m.numberMachine}
                      </td>
                      <td className="px-4 py-3">{m.typeMachineName ?? "—"}</td>
                      <td className="px-4 py-3 text-right">
                        {m.liquidated ? fmt(m.inOut) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {m.liquidated ? fmt(m.total) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {m.liquidated ? fmt(m.saldo) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {m.liquidated ? (
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                              m.faltaSobra < 0
                                ? "bg-red-50 text-red-700"
                                : "bg-green-50 text-green-700"
                            }`}
                          >
                            {m.faltaSobra > 0 ? "+" : ""}
                            {fmt(m.faltaSobra)}
                          </span>
                        ) : (
                          <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                            Sin liquidar
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
