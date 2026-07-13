import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import MachineForm from "../components/MachineForm";
import MachineDetail from "./MachineDetail";
import {
  getAllRoutes,
  createRoute,
  updateRoute,
  deleteRoute,
  getMachinesByRoute,
  deleteMachine,
} from "../lib/tauri";
import type { Route, User, Machine } from "../types";

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [showCreateRoute, setShowCreateRoute] = useState(false);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [newRouteName, setNewRouteName] = useState("");
  const [error, setError] = useState("");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [showCreateMachine, setShowCreateMachine] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [loadingMachines, setLoadingMachines] = useState(false);
  const [machinesError, setMachinesError] = useState("");
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [machineSearch, setMachineSearch] = useState("");

  // Diálogos de confirmación de eliminación
  const [deletingRoute, setDeletingRoute] = useState<Route | null>(null);
  const [routeDeleteError, setRouteDeleteError] = useState("");
  const [deletingRouteBusy, setDeletingRouteBusy] = useState(false);
  const [deletingMachine, setDeletingMachine] = useState<Machine | null>(null);
  const [machineDeleteError, setMachineDeleteError] = useState("");
  const [deletingMachineBusy, setDeletingMachineBusy] = useState(false);

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
    setEditingMachine(null);
    setSelectedMachine(null);
    setMachineSearch("");
    getMachinesByRoute(selectedRouteId)
      .then(setMachines)
      .catch(() => setMachinesError("Error cargando las máquinas"))
      .finally(() => setLoadingMachines(false));
  }, [selectedRouteId]);

  const handleRouteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      if (editingRoute) {
        const updated = await updateRoute(editingRoute.routeId, newRouteName);
        setRoutes((prev) =>
          prev
            .map((r) => (r.routeId === updated.routeId ? updated : r))
            .sort((a, b) => a.routeName.localeCompare(b.routeName))
        );
        setEditingRoute(null);
        setNewRouteName("");
      } else {
        const route = await createRoute(newRouteName);
        setRoutes((prev) =>
          [...prev, route].sort((a, b) =>
            a.routeName.localeCompare(b.routeName)
          )
        );
        setNewRouteName("");
        setShowCreateRoute(false);
        setSelectedRouteId(route.routeId);
      }
    } catch (err) {
      setError(typeof err === "string" ? err : "Error guardando la ruta");
    }
  };

  const cancelRouteForm = () => {
    setShowCreateRoute(false);
    setEditingRoute(null);
    setNewRouteName("");
    setError("");
  };

  const handleEditRoute = (route: Route) => {
    setEditingRoute(route);
    setShowCreateRoute(false);
    setNewRouteName(route.routeName);
    setError("");
  };

  const handleDeleteRouteConfirm = async () => {
    if (!deletingRoute) return;
    setDeletingRouteBusy(true);
    setRouteDeleteError("");
    try {
      await deleteRoute(deletingRoute.routeId);
      setRoutes((prev) =>
        prev.filter((r) => r.routeId !== deletingRoute.routeId)
      );
      if (selectedRouteId === deletingRoute.routeId) setSelectedRouteId(null);
      setDeletingRoute(null);
    } catch (err) {
      setRouteDeleteError(
        typeof err === "string" ? err : "Error eliminando la ruta"
      );
    } finally {
      setDeletingRouteBusy(false);
    }
  };

  const handleDeleteMachineConfirm = async () => {
    if (!deletingMachine) return;
    setDeletingMachineBusy(true);
    setMachineDeleteError("");
    try {
      await deleteMachine(deletingMachine.machineId);
      setMachines((prev) =>
        prev.filter((m) => m.machineId !== deletingMachine.machineId)
      );
      setDeletingMachine(null);
    } catch (err) {
      setMachineDeleteError(
        typeof err === "string" ? err : "Error eliminando la máquina"
      );
    } finally {
      setDeletingMachineBusy(false);
    }
  };

  const selectedRoute = routes.find((r) => r.routeId === selectedRouteId);
  const showRouteForm = showCreateRoute || editingRoute !== null;

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
        onAddRoute={() => {
          setEditingRoute(null);
          setNewRouteName("");
          setError("");
          setShowCreateRoute(true);
        }}
        onEditRoute={handleEditRoute}
        onDeleteRoute={(route) => {
          setRouteDeleteError("");
          setDeletingRoute(route);
        }}
        onLogout={onLogout}
        userName={user.userName}
      />

      {/* Área de contenido */}
      <main className="flex-1 overflow-y-auto p-8">
        {showRouteForm ? (
          <div className="max-w-md mx-auto mt-16">
            <h2 className="text-2xl font-bold text-navy-900 mb-6 text-center">
              {editingRoute ? "Editar Ruta" : "Crear Ruta"}
            </h2>
            <form onSubmit={handleRouteSubmit} className="space-y-4">
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
                  {editingRoute ? "Actualizar" : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={cancelRouteForm}
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
          ) : editingMachine ? (
            <MachineForm
              key={editingMachine.machineId}
              routeId={selectedRoute.routeId}
              routeName={selectedRoute.routeName}
              machine={editingMachine}
              onCreated={() => {}}
              onUpdated={(updated) => {
                setMachines((prev) => {
                  const rest = prev.filter(
                    (m) => m.machineId !== updated.machineId
                  );
                  // Si se movió a otra ruta, desaparece de la tabla actual
                  const next =
                    updated.routeId === selectedRoute.routeId
                      ? [...rest, updated]
                      : rest;
                  return next.sort((a, b) =>
                    a.numberMachine.localeCompare(b.numberMachine)
                  );
                });
                setEditingMachine(null);
              }}
              onCancel={() => setEditingMachine(null)}
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
                        <th className="px-2 py-3 w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMachines.map((m) => (
                        <tr
                          key={m.machineId}
                          onClick={() => setSelectedMachine(m)}
                          className="group border-t border-gray-100 hover:bg-navy-50 cursor-pointer transition-colors"
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
                          <td className="px-2 py-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              title="Editar máquina"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingMachine(m);
                              }}
                              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-navy-700 transition-opacity mr-3"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              title="Eliminar máquina"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMachineDeleteError("");
                                setDeletingMachine(m);
                              }}
                              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 transition-opacity"
                            >
                              🗑
                            </button>
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

      {/* Confirmación: eliminar ruta */}
      {deletingRoute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="font-semibold text-navy-900 mb-2">Eliminar ruta</h3>
            <p className="text-sm text-gray-600 mb-4">
              ¿Eliminar la ruta {deletingRoute.routeName}?
            </p>
            {routeDeleteError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md">
                {routeDeleteError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingRoute(null)}
                disabled={deletingRouteBusy}
                className="bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteRouteConfirm}
                disabled={deletingRouteBusy}
                className="bg-red-600 text-white hover:bg-red-700 rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:bg-gray-400"
              >
                {deletingRouteBusy ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación: eliminar máquina */}
      {deletingMachine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="font-semibold text-navy-900 mb-2">
              Eliminar máquina
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              ¿Eliminar la máquina {deletingMachine.numberMachine}?
            </p>
            {machineDeleteError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md">
                {machineDeleteError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingMachine(null)}
                disabled={deletingMachineBusy}
                className="bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteMachineConfirm}
                disabled={deletingMachineBusy}
                className="bg-red-600 text-white hover:bg-red-700 rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:bg-gray-400"
              >
                {deletingMachineBusy ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
