import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import MachineForm from "../components/MachineForm";
import MachineDetail from "./MachineDetail";
import { getAllRoutes, createRoute, getMachinesByRoute } from "../lib/tauri";
import type { Route, User, Machine } from "../types";

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [showCreateRoute, setShowCreateRoute] = useState(false);
  const [newRouteName, setNewRouteName] = useState("");
  const [error, setError] = useState("");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [showCreateMachine, setShowCreateMachine] = useState(false);
  const [loadingMachines, setLoadingMachines] = useState(false);
  const [machinesError, setMachinesError] = useState("");
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [machineSearch, setMachineSearch] = useState("");

  // Cargar rutas al montar
  useEffect(() => {
    getAllRoutes()
      .then(setRoutes)
      .catch((err) =>
        setError(typeof err === "string" ? err : "Error cargando rutas")
      );
  }, []);

  // Cargar máquinas cuando cambia la ruta seleccionada
  useEffect(() => {
    if (selectedRouteId === null) {
      setMachines([]);
      return;
    }
    setLoadingMachines(true);
    setMachinesError("");
    setShowCreateMachine(false);
    setSelectedMachine(null);
    setMachineSearch("");
    getMachinesByRoute(selectedRouteId)
      .then(setMachines)
      .catch(() => setMachinesError("Error cargando las máquinas"))
      .finally(() => setLoadingMachines(false));
  }, [selectedRouteId]);

  const handleCreateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const route = await createRoute(newRouteName);
      setRoutes((prev) =>
        [...prev, route].sort((a, b) => a.routeName.localeCompare(b.routeName))
      );
      setNewRouteName("");
      setShowCreateRoute(false);
      setSelectedRouteId(route.routeId);
    } catch (err) {
      setError(typeof err === "string" ? err : "Error creando la ruta");
    }
  };

  const selectedRoute = routes.find((r) => r.routeId === selectedRouteId);

  // Solo afecta la tabla; la navegación de MachineDetail usa la lista completa
  const filteredMachines = machines.filter((m) =>
    m.numberMachine.toLowerCase().includes(machineSearch.trim().toLowerCase())
  );

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        routes={routes}
        selectedRouteId={selectedRouteId}
        onSelectRoute={setSelectedRouteId}
        onAddRoute={() => setShowCreateRoute(true)}
        onLogout={onLogout}
        userName={user.userName}
      />

      {/* Área de contenido */}
      <main className="flex-1 overflow-y-auto p-8">
        {showCreateRoute ? (
          <div className="max-w-md mx-auto mt-16">
            <h2 className="text-2xl font-bold text-navy-900 mb-6 text-center">
              Crear Ruta
            </h2>
            <form onSubmit={handleCreateRoute} className="space-y-4">
              <input
                type="text"
                value={newRouteName}
                onChange={(e) => setNewRouteName(e.target.value)}
                placeholder="Nombre de la ruta (ej: Ruta A)"
                autoFocus
                required
                className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-500"
              />
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md">
                  {error}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 bg-navy-900 text-white py-2.5 rounded-md font-semibold hover:bg-navy-800 transition-colors"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateRoute(false);
                    setNewRouteName("");
                    setError("");
                  }}
                  className="flex-1 bg-gray-200 text-gray-700 py-2.5 rounded-md font-semibold hover:bg-gray-300 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        ) : selectedRoute ? (
          selectedMachine ? (
            <MachineDetail
              machine={selectedMachine}
              machines={machines}
              onNavigate={setSelectedMachine}
              onBack={() => setSelectedMachine(null)}
            />
          ) : showCreateMachine ? (
            <MachineForm
              routeId={selectedRoute.routeId}
              routeName={selectedRoute.routeName}
              onCreated={(machine) => {
                setMachines((prev) =>
                  [...prev, machine].sort((a, b) =>
                    a.numberMachine.localeCompare(b.numberMachine)
                  )
                );
                setShowCreateMachine(false);
              }}
              onCancel={() => setShowCreateMachine(false)}
            />
          ) : (
            <div>
              <div className="flex items-center justify-between gap-4 mb-6">
                <h2 className="text-2xl font-bold text-navy-900">
                  {selectedRoute.routeName}
                </h2>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={machineSearch}
                    onChange={(e) => setMachineSearch(e.target.value)}
                    placeholder="Buscar máquina..."
                    className="w-48 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                  />
                  <button
                    onClick={() => setShowCreateMachine(true)}
                    className="bg-navy-900 text-white px-4 py-2 rounded-md font-medium hover:bg-navy-800 transition-colors whitespace-nowrap"
                  >
                    + Agregar máquina
                  </button>
                </div>
              </div>

              {machinesError && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md">
                  {machinesError}
                </div>
              )}

              {loadingMachines ? (
                <p className="text-gray-400">Cargando máquinas...</p>
              ) : machines.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <p className="text-lg mb-1">Esta ruta no tiene máquinas</p>
                  <p className="text-sm">
                    Agregá la primera con el botón de arriba
                  </p>
                </div>
              ) : filteredMachines.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <p className="text-lg">No hay máquinas que coincidan</p>
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-navy-900 text-white text-left">
                        <th className="px-4 py-3 font-medium">Número</th>
                        <th className="px-4 py-3 font-medium">Tipo</th>
                        <th className="px-4 py-3 font-medium">Moneda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMachines.map((m) => (
                        <tr
                          key={m.machineId}
                          onClick={() => setSelectedMachine(m)}
                          className="border-t border-gray-100 hover:bg-navy-50 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3 font-medium text-navy-900">
                            {m.numberMachine}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {m.typeMachineName ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {m.numCoin !== null ? `$${m.numCoin}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-400 text-lg text-center">
              Seleccioná una ruta del panel lateral
              <br />
              para comenzar
            </p>
          </div>
        )}
      </main>
    </div>
  );
}