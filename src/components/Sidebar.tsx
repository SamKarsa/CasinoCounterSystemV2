import { useEffect, useState } from "react";
import { Folder } from "lucide-react";
import type { Route } from "../types";

interface SidebarProps {
  routes: Route[];
  selectedRouteId: number | null;
  onSelectRoute: (routeId: number) => void;
  onAddRoute: () => void;
  onEditRoute: (route: Route) => void;
  onDeleteRoute: (route: Route) => void;
  onLogout: () => void;
  userName: string;
}

export default function Sidebar({
  routes,
  selectedRouteId,
  onSelectRoute,
  onAddRoute,
  onEditRoute,
  onDeleteRoute,
  onLogout,
  userName,
}: SidebarProps) {
  // Menú contextual (clic derecho) sobre una ruta
  const [menu, setMenu] = useState<{ x: number; y: number; route: Route } | null>(
    null
  );

  // Cerrar el menú al hacer click fuera o con Escape
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  return (
    <aside className="w-64 bg-navy-950 flex flex-col h-screen">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10">
        <h1 className="text-white font-bold text-xl leading-tight">
          CLT Electronic
        </h1>
        <p className="text-navy-300 text-xs">Casino Counter System</p>
      </div>

      {/* Lista de rutas */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-navy-300 text-xs font-semibold uppercase tracking-wide">
            Rutas
          </span>
          <button
            onClick={onAddRoute}
            title="Agregar ruta"
            className="text-navy-300 hover:text-white text-lg leading-none px-1 rounded transition-colors"
          >
            +
          </button>
        </div>

        {routes.length === 0 ? (
          <p className="text-navy-400 text-sm px-2 py-4 text-center">
            No hay rutas todavía.
            <br />
            Creá la primera con el +
          </p>
        ) : (
          <ul className="space-y-0.5">
            {routes.map((route) => (
              <li key={route.routeId}>
                <button
                  onClick={() => onSelectRoute(route.routeId)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, route });
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors ${
                    selectedRouteId === route.routeId
                      ? "bg-white/15 text-white font-medium"
                      : "text-navy-200 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Folder size={16} className="shrink-0" />
                  <span className="truncate">{route.routeName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      {/* Usuario + logout */}
      <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between">
        <span className="text-navy-300 text-sm">{userName}</span>
        <button
          onClick={onLogout}
          className="text-navy-300 hover:text-white text-sm transition-colors"
        >
          Salir
        </button>
      </div>

      {/* Menú contextual flotante */}
      {menu && (
        <div
          className="fixed z-50 min-w-[9rem] rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg"
          style={{ top: menu.y, left: menu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              onEditRoute(menu.route);
              setMenu(null);
            }}
            className="block w-full px-4 py-1.5 text-left text-gray-700 hover:bg-gray-100"
          >
            Editar
          </button>
          <button
            onClick={() => {
              onDeleteRoute(menu.route);
              setMenu(null);
            }}
            className="block w-full px-4 py-1.5 text-left text-red-600 hover:bg-red-50"
          >
            Eliminar
          </button>
        </div>
      )}
    </aside>
  );
}
