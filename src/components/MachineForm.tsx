import { useEffect, useState } from "react";
import {
  createMachine,
  updateMachine,
  getAllTypeMachines,
  getAllCoinTypes,
  getAllRoutes,
} from "../lib/tauri";
import type { Machine, TypeMachine, CoinType, Route } from "../types";

interface MachineFormProps {
  routeId: number;
  routeName: string;
  machine?: Machine; // si viene → modo edición
  onCreated: (machine: Machine) => void;
  onUpdated?: (machine: Machine) => void;
  onCancel: () => void;
}

export default function MachineForm({
  routeId,
  routeName,
  machine,
  onCreated,
  onUpdated,
  onCancel,
}: MachineFormProps) {
  const isEdit = !!machine;

  const [types, setTypes] = useState<TypeMachine[]>([]);
  const [coins, setCoins] = useState<CoinType[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [numberMachine, setNumberMachine] = useState(machine?.numberMachine ?? "");
  const [typeMachineId, setTypeMachineId] = useState<number>(
    machine?.typeMachineId ?? 0
  );
  const [coinTypeId, setCoinTypeId] = useState<number>(machine?.coinTypeId ?? 0);
  const [selectedRouteId, setSelectedRouteId] = useState<number>(
    machine?.routeId ?? routeId
  );
  const [initialIn, setInitialIn] = useState("");
  const [initialOut, setInitialOut] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([getAllTypeMachines(), getAllCoinTypes()])
      .then(([t, c]) => {
        setTypes(t);
        setCoins(c);
        // En creación se elige el primero por defecto; en edición ya viene precargado
        if (!isEdit) {
          if (t.length > 0) setTypeMachineId(t[0].typeMachineId);
          if (c.length > 0) setCoinTypeId(c[0].coinTypeId);
        }
      })
      .catch(() => setError("Error cargando tipos y monedas"));
  }, [isEdit]);

  // Las rutas solo hacen falta en edición (para mover la máquina de ruta)
  useEffect(() => {
    if (!isEdit) return;
    getAllRoutes()
      .then(setRoutes)
      .catch(() => setError("Error cargando las rutas"));
  }, [isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (machine) {
        const updated = await updateMachine({
          machineId: machine.machineId,
          numberMachine,
          typeMachineId,
          coinTypeId,
          routeId: selectedRouteId,
        });
        onUpdated?.(updated);
      } else {
        const created = await createMachine({
          numberMachine,
          typeMachineId,
          coinTypeId,
          routeId,
          initialIn: parseInt(initialIn, 10),
          initialOut: parseInt(initialOut, 10),
        });
        onCreated(created);
      }
    } catch (err) {
      setError(
        typeof err === "string"
          ? err
          : isEdit
          ? "Error actualizando la máquina"
          : "Error creando la máquina"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto mt-8 bg-white border border-gray-200 rounded-lg shadow-sm p-8">
      <h2 className="text-2xl font-bold text-navy-900 mb-1 text-center">
        {isEdit ? "Editar máquina" : "Crear Máquina"}
      </h2>
      {!isEdit && (
        <p className="text-gray-500 text-center text-sm mb-6">en {routeName}</p>
      )}

      <form onSubmit={handleSubmit} className={isEdit ? "space-y-4 mt-6" : "space-y-4"}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Número de máquina
            </label>
            <input
              type="text"
              value={numberMachine}
              onChange={(e) => setNumberMachine(e.target.value)}
              placeholder="ej: A01"
              autoFocus
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de máquina
            </label>
            <select
              value={typeMachineId}
              onChange={(e) => setTypeMachineId(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-500 bg-white"
            >
              {types.map((t) => (
                <option key={t.typeMachineId} value={t.typeMachineId}>
                  {t.nameTypeMachine}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Moneda
            </label>
            <select
              value={coinTypeId}
              onChange={(e) => setCoinTypeId(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-500 bg-white"
            >
              {coins.map((c) => (
                <option key={c.coinTypeId} value={c.coinTypeId}>
                  ${c.numCoin}
                </option>
              ))}
            </select>
          </div>
          {isEdit ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ruta
              </label>
              <select
                value={selectedRouteId}
                onChange={(e) => setSelectedRouteId(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-500 bg-white"
              >
                {routes.map((r) => (
                  <option key={r.routeId} value={r.routeId}>
                    {r.routeName}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div></div>
          )}
          {!isEdit && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  IN instalación
                </label>
                <input
                  type="number"
                  min="0"
                  value={initialIn}
                  onChange={(e) => setInitialIn(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  OUT instalación
                </label>
                <input
                  type="number"
                  min="0"
                  value={initialOut}
                  onChange={(e) => setInitialOut(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-500"
                />
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-navy-900 text-white py-2.5 rounded-md font-semibold hover:bg-navy-800 transition-colors disabled:bg-gray-400"
          >
            {loading
              ? isEdit
                ? "Actualizando..."
                : "Guardando..."
              : isEdit
              ? "Actualizar"
              : "Guardar"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 bg-gray-200 text-gray-700 py-2.5 rounded-md font-semibold hover:bg-gray-300 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
