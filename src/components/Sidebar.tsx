import type { Route } from "../types";

interface SidebarProps {
  routes: Route[];
  selectedRouteId: number | null;
  onSelectRoute: (routeId: number) => void;
  onAddRoute: () => void;
  onLogout: () => void;
  userName: string;
}

export default function Sidebar({
  routes,
  selectedRouteId,
  onSelectRoute,
  onAddRoute,
  onLogout,
  userName,
}: SidebarProps) {
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
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedRouteId === route.routeId
                      ? "bg-white/15 text-white font-medium"
                      : "text-navy-200 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  📁 {route.routeName}
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
    </aside>
  );
}