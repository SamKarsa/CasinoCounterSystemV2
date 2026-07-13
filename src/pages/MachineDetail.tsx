import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import {
  getRecordsByMachine,
  createCounterRecord,
  updateCounterRecord,
  deleteCounterRecord,
} from "../lib/tauri";
import type { Machine, CounterRecordWithCalc } from "../types";

interface MachineDetailProps {
  machine: Machine;
  machines: Machine[];
  onNavigate: (machine: Machine) => void;
  onBack: () => void;
}

// Formato de moneda para mostrar (ej: 10,000)
const fmt = (n: number) =>
  n.toLocaleString("es-CO", { maximumFractionDigits: 2 });

// Fecha de hoy en YYYY-MM-DD (local)
const today = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

export default function MachineDetail({
  machine,
  machines,
  onNavigate,
  onBack,
}: MachineDetailProps) {
  const [records, setRecords] = useState<CounterRecordWithCalc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Formulario de nuevo registro
  const [recordDate, setRecordDate] = useState(today());
  const [inValue, setInValue] = useState("");
  const [outValue, setOutValue] = useState("");
  const [totalValue, setTotalValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const inRef = useRef<HTMLInputElement>(null);

  // Edición y eliminación
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    // Al cambiar de máquina, salir de cualquier modo edición/eliminación
    setEditingId(null);
    setDeletingId(null);
    setLoading(true);
    getRecordsByMachine(machine.machineId)
      .then(setRecords)
      .catch((err) =>
        setError(typeof err === "string" ? err : "Error cargando registros")
      )
      .finally(() => setLoading(false));
  }, [machine.machineId]);

  const lastRecord = records.length > 0 ? records[records.length - 1] : null;

  // El registro contra el que se compara el preview:
  // - modo nuevo: el último de la lista
  // - modo edición: el registro ANTERIOR al que se edita
  const editingIndex =
    editingId !== null
      ? records.findIndex((r) => r.counterRecordId === editingId)
      : -1;
  const basisRecord =
    editingId !== null
      ? editingIndex > 0
        ? records[editingIndex - 1]
        : null
      : lastRecord;

  // Preview en vivo (solo estimación; el valor oficial lo calcula Rust al guardar)
  const preview = useMemo(() => {
    const inN = parseInt(inValue, 10);
    const outN = parseInt(outValue, 10);
    const totalN = parseFloat(totalValue);
    if (
      !basisRecord ||
      machine.numCoin === null ||
      Number.isNaN(inN) ||
      Number.isNaN(outN)
    ) {
      return null;
    }
    const isPoker = machine.typeMachineName === "Poker";
    const inOut = isPoker
      ? (outN - basisRecord.counterOut) * machine.numCoin
      : (inN - basisRecord.counterIn - (outN - basisRecord.counterOut)) *
        machine.numCoin;
    const faltaSobra = Number.isNaN(totalN) ? null : totalN - inOut;
    return { inOut, faltaSobra };
  }, [inValue, outValue, totalValue, basisRecord, machine.numCoin, machine.typeMachineName]);

  // Entrar a editar una fila (la base solo llega aquí si es el único registro)
  const startEdit = (r: CounterRecordWithCalc) => {
    setEditingId(r.counterRecordId);
    setRecordDate(r.recordDate);
    setInValue(String(r.counterIn));
    setOutValue(String(r.counterOut));
    setTotalValue(String(r.totalDelivered));
    setFormError("");
    inRef.current?.focus();
  };

  // Volver al modo "nuevo registro" (fecha de hoy, campos limpios)
  const exitEdit = () => {
    setEditingId(null);
    setInValue("");
    setOutValue("");
    setTotalValue("");
    setRecordDate(today());
    setFormError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      if (editingId !== null) {
        await updateCounterRecord({
          counterRecordId: editingId,
          recordDate,
          counterIn: parseInt(inValue, 10),
          counterOut: parseInt(outValue, 10),
          totalDelivered: parseFloat(totalValue),
        });
        // Editar uno del medio recalcula a los posteriores: recargar todo
        const fresh = await getRecordsByMachine(machine.machineId);
        setRecords(fresh);
        exitEdit();
      } else {
        const record = await createCounterRecord({
          machineId: machine.machineId,
          recordDate,
          counterIn: parseInt(inValue, 10),
          counterOut: parseInt(outValue, 10),
          totalDelivered: parseFloat(totalValue),
        });
        setRecords((prev) => [...prev, record]);
        setInValue("");
        setOutValue("");
        setTotalValue("");
      }
      inRef.current?.focus();
    } catch (err) {
      setFormError(typeof err === "string" ? err : "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deletingId === null) return;
    setDeleting(true);
    try {
      await deleteCounterRecord(deletingId);
      if (editingId === deletingId) exitEdit();
      // Los posteriores se recalculan en el backend: recargar todo
      const fresh = await getRecordsByMachine(machine.machineId);
      setRecords(fresh);
      setDeletingId(null);
    } catch (err) {
      setError(typeof err === "string" ? err : "Error eliminando el registro");
      setDeletingId(null);
    } finally {
      setDeleting(false);
    }
  };

  const deletingRecord =
    deletingId !== null
      ? records.find((r) => r.counterRecordId === deletingId) ?? null
      : null;

  const editingRecord =
    editingId !== null
      ? records.find((r) => r.counterRecordId === editingId) ?? null
      : null;
  const editingBaseline = editingRecord?.isBaseline ?? false;

  // Navegación entre las máquinas de la ruta (mismo orden que la tabla)
  const currentIndex = machines.findIndex(
    (m) => m.machineId === machine.machineId
  );
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < machines.length - 1;

  const goTo = (target: Machine) => {
    // Salir de edición y limpiar; la fecha se conserva salvo que veníamos editando
    setInValue("");
    setOutValue("");
    setTotalValue("");
    setFormError("");
    setDeletingId(null);
    if (editingId !== null) {
      setEditingId(null);
      setRecordDate(today());
    }
    onNavigate(target);
    inRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-navy-900">
            Máquina {machine.numberMachine}
          </h2>
          <p className="text-gray-500 text-sm">
            {machine.typeMachineName ?? "—"} · $
            {machine.numCoin ?? "—"} · {machine.routeName ?? "—"}
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

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md mb-4">
          {error}
        </div>
      )}

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Tabla de registros */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-gray-400">Cargando registros...</p>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="bg-navy-900 text-white text-left">
                    <th className="px-3 py-2.5 font-medium">Fecha</th>
                    <th className="px-3 py-2.5 font-medium text-right">IN</th>
                    <th className="px-3 py-2.5 font-medium text-right">OUT</th>
                    <th className="px-3 py-2.5 font-medium text-right">
                      IN-OUT
                    </th>
                    <th className="px-3 py-2.5 font-medium text-right">
                      Total
                    </th>
                    <th className="px-3 py-2.5 font-medium text-right">
                      Saldo
                    </th>
                    <th className="px-3 py-2.5 font-medium text-right">
                      Falta/Sobra
                    </th>
                    <th className="px-2 py-2.5 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => {
                    const isEditing = r.counterRecordId === editingId;
                    return (
                      <tr
                        key={r.counterRecordId}
                        className={`group border-t border-gray-100 hover:bg-navy-50 ${
                          isEditing ? "bg-navy-50" : ""
                        }`}
                      >
                        <td className="px-3 py-2.5 text-gray-700">
                          {r.recordDate}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-700">
                          {fmt(r.counterIn)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-700">
                          {fmt(r.counterOut)}
                        </td>
                        {r.isBaseline ? (
                          <>
                            <td
                              colSpan={4}
                              className="px-3 py-2.5 text-right text-gray-400 italic"
                            >
                              instalación
                            </td>
                            <td className="px-2 py-2.5 text-right whitespace-nowrap">
                              {records.length === 1 && (
                                <button
                                  type="button"
                                  title="Editar instalación"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startEdit(r);
                                  }}
                                  className="inline-flex align-middle opacity-0 group-hover:opacity-100 text-gray-400 hover:text-navy-700 transition-opacity"
                                >
                                  <Pencil size={16} />
                                </button>
                              )}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2.5 text-right text-gray-700">
                              {r.inOut !== null ? fmt(r.inOut) : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-700">
                              {fmt(r.totalDelivered)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-700">
                              {r.saldo !== null ? fmt(r.saldo) : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {r.faltaSobra !== null ? (
                                <span
                                  className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                                    r.faltaSobra < 0
                                      ? "bg-red-50 text-red-700"
                                      : "bg-green-50 text-green-700"
                                  }`}
                                >
                                  {r.faltaSobra > 0 ? "+" : ""}
                                  {fmt(r.faltaSobra)}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-2 py-2.5 text-right whitespace-nowrap">
                              <button
                                type="button"
                                title="Editar registro"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEdit(r);
                                }}
                                className="inline-flex align-middle opacity-0 group-hover:opacity-100 text-gray-400 hover:text-navy-700 transition-opacity mr-3"
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                type="button"
                                title="Eliminar registro"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingId(r.counterRecordId);
                                }}
                                className="inline-flex align-middle opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 transition-opacity"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Panel de nuevo registro */}
        <aside className="w-72 shrink-0">
          <div className="bg-white rounded-lg border border-gray-200 p-4 sticky top-0">
            <h3 className="font-semibold text-navy-900 mb-3">
              {editingId !== null ? "Editar registro" : "Nuevo registro"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Fecha
                </label>
                <input
                  type="date"
                  value={recordDate}
                  onChange={(e) => setRecordDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  IN
                </label>
                <input
                  ref={inRef}
                  type="number"
                  min="0"
                  value={inValue}
                  onChange={(e) => setInValue(e.target.value)}
                  autoFocus
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  OUT
                </label>
                <input
                  type="number"
                  min="0"
                  value={outValue}
                  onChange={(e) => setOutValue(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Total contado
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={totalValue}
                  onChange={(e) => setTotalValue(e.target.value)}
                  required
                  disabled={editingBaseline}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>

              {/* Preview en vivo (no aplica a la línea base: no se liquida) */}
              {preview && !editingBaseline && (
                <div className="bg-gray-50 rounded-md p-3 text-sm space-y-1">
                  <div className="flex justify-between text-gray-600">
                    <span>IN-OUT</span>
                    <span className="font-medium text-gray-900">
                      {fmt(preview.inOut)}
                    </span>
                  </div>
                  {preview.faltaSobra !== null && (
                    <div className="flex justify-between text-gray-600">
                      <span>Falta/Sobra</span>
                      <span
                        className={`font-semibold ${
                          preview.faltaSobra < 0
                            ? "text-red-600"
                            : "text-green-600"
                        }`}
                      >
                        {preview.faltaSobra > 0 ? "+" : ""}
                        {fmt(preview.faltaSobra)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-md">
                  {formError}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full bg-navy-900 text-white py-2 rounded-md font-semibold text-sm hover:bg-navy-800 transition-colors disabled:bg-gray-400"
              >
                {saving
                  ? editingId !== null
                    ? "Actualizando..."
                    : "Guardando..."
                  : editingId !== null
                  ? "Actualizar"
                  : "Guardar"}
              </button>

              {editingId !== null && (
                <button
                  type="button"
                  onClick={exitEdit}
                  className="w-full bg-gray-200 text-gray-700 py-2 rounded-md font-medium text-sm hover:bg-gray-300 transition-colors"
                >
                  Cancelar
                </button>
              )}
            </form>

            {/* Navegación entre máquinas de la ruta */}
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => hasPrev && goTo(machines[currentIndex - 1])}
                disabled={!hasPrev}
                className="inline-flex items-center gap-1 bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
                Anterior
              </button>
              <span className="text-xs text-gray-500">
                {currentIndex >= 0 ? currentIndex + 1 : "—"} de {machines.length}
              </span>
              <button
                type="button"
                onClick={() => hasNext && goTo(machines[currentIndex + 1])}
                disabled={!hasNext}
                className="inline-flex items-center gap-1 bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Siguiente
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Confirmación de eliminación (diálogo propio, no window.confirm) */}
      {deletingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="font-semibold text-navy-900 mb-2">
              Eliminar registro
            </h3>
            <p className="text-sm text-gray-600 mb-5">
              ¿Eliminar el registro del {deletingRecord.recordDate}? Los
              cálculos de los registros posteriores se recalcularán.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingId(null)}
                disabled={deleting}
                className="bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-600 text-white hover:bg-red-700 rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:bg-gray-400"
              >
                {deleting ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}