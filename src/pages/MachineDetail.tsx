import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  getRecordsByMachine,
  createCounterRecord,
  createBaselineRecord,
  updateCounterRecord,
  deleteCounterRecord,
} from "../lib/tauri";
import type { Machine, CounterRecordWithCalc } from "../types";

interface MachineDetailProps {
  machine: Machine;
  machines: Machine[];
  onNavigate: (machine: Machine) => void;
  onBack: () => void;
  isAdmin: boolean;
}

// Encabezado pegado al scrollear: el fondo va en el th (el del tr no viaja con
// la celda sticky) y z-10 lo mantiene por encima de las filas.
const th =
  "sticky top-0 z-10 bg-navy-900 py-2.5 font-mono text-[11px] font-medium uppercase tracking-wider";

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
  isAdmin,
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

  // Menú de acciones excepcionales del header (hoy solo "Reiniciar contadores")
  const [actionsOpen, setActionsOpen] = useState(false);

  // Reinicio de contadores (cambio de tarjeta): baseline nuevo al final
  const [resetOpen, setResetOpen] = useState(false);
  const [resetDate, setResetDate] = useState(today());
  const [resetIn, setResetIn] = useState("");
  const [resetOut, setResetOut] = useState("");
  const [resetSaving, setResetSaving] = useState(false);
  const [resetError, setResetError] = useState("");

  // Tabla: scroll al fondo al cargar y resaltado de la fila recién guardada
  const tableScrollRef = useRef<HTMLDivElement>(null);
  // nonce: guardar dos veces la misma fila debe volver a disparar el resaltado
  const [highlight, setHighlight] = useState<{
    id: number;
    nonce: number;
  } | null>(null);
  const flashRow = (id: number) =>
    setHighlight((prev) => ({ id, nonce: (prev?.nonce ?? 0) + 1 }));

  useEffect(() => {
    // Al cambiar de máquina, salir de cualquier modo edición/eliminación
    setEditingId(null);
    setDeletingId(null);
    setActionsOpen(false);
    setResetOpen(false);
    setHighlight(null);
    setLoading(true);
    getRecordsByMachine(machine.machineId)
      .then(setRecords)
      .catch((err) =>
        setError(typeof err === "string" ? err : "Error cargando registros")
      )
      .finally(() => setLoading(false));
  }, [machine.machineId]);

  // Menú de acciones: cerrar al hacer click fuera o con Escape (igual que el
  // menú contextual de rutas del sidebar)
  useEffect(() => {
    if (!actionsOpen) return;
    const close = () => setActionsOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActionsOpen(false);
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [actionsOpen]);

  // Los registros más recientes están al final: arrancar abajo, sin animación
  useLayoutEffect(() => {
    if (loading) return;
    const el = tableScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [loading, machine.machineId]);

  // Tras guardar: llevar la fila a la vista (solo si quedó fuera) y resaltarla ~2s
  useEffect(() => {
    if (!highlight) return;
    tableScrollRef.current
      ?.querySelector(`[data-record-id="${highlight.id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const timer = setTimeout(() => setHighlight(null), 2000);
    return () => clearTimeout(timer);
  }, [highlight]);

  const lastRecord = records.length > 0 ? records[records.length - 1] : null;

  // El baseline más antiguo es la instalación (intocable); los demás son
  // reinicios. records viene ordenado ASC, así que el primero es el más antiguo.
  const installBaselineId =
    records.find((r) => r.isBaseline)?.counterRecordId ?? null;

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

  // Entrar a editar una fila (cualquier registro, incluidos los baselines: al
  // editar un baseline el total va deshabilitado en 0 y el preview se oculta)
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
        const editedId = editingId;
        await updateCounterRecord({
          counterRecordId: editedId,
          recordDate,
          counterIn: parseInt(inValue, 10),
          counterOut: parseInt(outValue, 10),
          totalDelivered: parseFloat(totalValue),
        });
        // Editar uno del medio recalcula a los posteriores: recargar todo
        const fresh = await getRecordsByMachine(machine.machineId);
        setRecords(fresh);
        exitEdit();
        flashRow(editedId);
      } else {
        const record = await createCounterRecord({
          machineId: machine.machineId,
          recordDate,
          counterIn: parseInt(inValue, 10),
          counterOut: parseInt(outValue, 10),
          totalDelivered: parseFloat(totalValue),
        });
        setRecords((prev) => [...prev, record]);
        flashRow(record.counterRecordId);
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

  const openReset = () => {
    setResetDate(today());
    setResetIn("");
    setResetOut("");
    setResetError("");
    setResetOpen(true);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError("");
    setResetSaving(true);
    try {
      const baseline = await createBaselineRecord({
        machineId: machine.machineId,
        recordDate: resetDate,
        counterIn: parseInt(resetIn, 10),
        counterOut: parseInt(resetOut, 10),
      });
      // El baseline nuevo va al final: recargar todo y resaltar la fila
      const fresh = await getRecordsByMachine(machine.machineId);
      setRecords(fresh);
      setResetOpen(false);
      flashRow(baseline.counterRecordId);
    } catch (err) {
      setResetError(typeof err === "string" ? err : "Error al reiniciar");
    } finally {
      setResetSaving(false);
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
        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && (
            <div className="relative">
              <button
                type="button"
                title="Acciones"
                onClick={(e) => {
                  e.stopPropagation();
                  setActionsOpen((o) => !o);
                }}
                className="inline-flex items-center bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-md px-2 py-1.5 text-sm font-medium transition-colors"
              >
                <MoreVertical size={16} />
              </button>
              {actionsOpen && (
                <div
                  className="absolute right-0 top-full mt-1 z-50 min-w-[12rem] rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActionsOpen(false);
                      openReset();
                    }}
                    className="flex w-full items-center gap-2 px-4 py-1.5 text-left text-gray-700 hover:bg-gray-100"
                  >
                    <RotateCcw size={16} />
                    Reiniciar contadores
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1 bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          >
            <ChevronLeft size={16} />
            Volver
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md mb-4">
          {error}
        </div>
      )}

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Tabla de registros */}
        <div className="flex-1 min-h-0">
          {loading ? (
            <p className="text-gray-400">Cargando registros...</p>
          ) : (
            // El scroll vive en la tarjeta: el thead sticky se ancla a ella.
            // Su overflow recorta las esquinas redondeadas del header pegado.
            <div
              ref={tableScrollRef}
              className="max-h-full overflow-y-auto bg-white rounded border border-gray-200"
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-white text-left">
                    <th className={`${th} px-3`}>Fecha</th>
                    <th className={`${th} px-3 text-right`}>IN</th>
                    <th className={`${th} px-3 text-right`}>OUT</th>
                    <th className={`${th} px-3 text-right`}>IN-OUT</th>
                    <th className={`${th} px-3 text-right`}>Total</th>
                    <th className={`${th} px-3 text-right`}>Saldo</th>
                    <th className={`${th} px-3 text-right`}>Falta/Sobra</th>
                    <th className={`${th} px-2 w-16`}></th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => {
                    const isEditing = r.counterRecordId === editingId;
                    const isHighlighted = r.counterRecordId === highlight?.id;
                    const isInstall = r.counterRecordId === installBaselineId;
                    const isLast =
                      r.counterRecordId === lastRecord?.counterRecordId;
                    // Papelera de un reinicio: solo si es el último registro (borrarlo
                    // con posteriores los dejaría calculando contra otro ciclo)
                    const showBaselineTrash = isAdmin && !isInstall && isLast;
                    return (
                      <tr
                        key={r.counterRecordId}
                        data-record-id={r.counterRecordId}
                        className={`group border-t border-gray-100 transition-colors duration-500 hover:bg-navy-50 ${
                          isHighlighted
                            ? "bg-green-50"
                            : isEditing
                            ? "bg-navy-50"
                            : ""
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
                              {r.counterRecordId === installBaselineId
                                ? "instalación"
                                : "reinicio"}
                            </td>
                            <td className="px-2 py-2.5 text-right whitespace-nowrap">
                              {/* El lápiz aparece en todos los baselines (instalación y reinicio) */}
                              <button
                                type="button"
                                title={
                                  isInstall
                                    ? "Editar instalación"
                                    : "Editar reinicio"
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEdit(r);
                                }}
                                className={`inline-flex align-middle opacity-0 group-hover:opacity-100 text-gray-400 hover:text-navy-700 transition-opacity ${
                                  showBaselineTrash ? "mr-3" : ""
                                }`}
                              >
                                <Pencil size={16} />
                              </button>
                              {/* Papelera: nunca en instalación; en un reinicio solo si es el último */}
                              {showBaselineTrash && (
                                <button
                                  type="button"
                                  title="Eliminar reinicio"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeletingId(r.counterRecordId);
                                  }}
                                  className="inline-flex align-middle opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 transition-opacity"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </td>
                          </>
                        ) : (
                          <>
                            <td
                              className={`px-3 py-2.5 text-right ${
                                r.inOut !== null && r.inOut < 0
                                  ? "text-red-600 font-medium"
                                  : "text-gray-700"
                              }`}
                            >
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
                                className={`inline-flex align-middle opacity-0 group-hover:opacity-100 text-gray-400 hover:text-navy-700 transition-opacity ${
                                  isAdmin ? "mr-3" : ""
                                }`}
                              >
                                <Pencil size={16} />
                              </button>
                              {isAdmin && (
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
                              )}
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
          <div className="bg-white rounded border border-gray-200 p-4 sticky top-0">
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

      {/* Reinicio de contadores (cambio de tarjeta) */}
      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded bg-white p-6 shadow-xl">
            <h3 className="font-semibold text-navy-900 mb-2">
              Reiniciar contadores
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Usá esta opción si a la máquina le cambiaron los contadores. Se
              guarda un punto de partida nuevo y el histórico anterior se
              conserva.
            </p>
            <form onSubmit={handleReset} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Fecha
                </label>
                <input
                  type="date"
                  value={resetDate}
                  onChange={(e) => setResetDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  IN
                </label>
                <input
                  type="number"
                  min="0"
                  value={resetIn}
                  onChange={(e) => setResetIn(e.target.value)}
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
                  value={resetOut}
                  onChange={(e) => setResetOut(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                />
              </div>

              {resetError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-md">
                  {resetError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setResetOpen(false)}
                  disabled={resetSaving}
                  className="bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={resetSaving}
                  className="bg-navy-900 text-white hover:bg-navy-800 rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:bg-gray-400"
                >
                  {resetSaving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmación de eliminación (diálogo propio, no window.confirm) */}
      {deletingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded bg-white p-6 shadow-xl">
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