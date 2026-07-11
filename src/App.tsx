import { useState } from "react";
import "./App.css";
import Login from "./pages/Login";
import type { User } from "./types";

function App() {
  const [user, setUser] = useState<User | null>(null);

  if (!user) {
    return <Login onLoginSuccess={setUser} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-navy-900 mb-2">
          Bienvenido, {user.userName}
        </h1>
        <p className="text-gray-600 mb-6">Rol: {user.roleName}</p>
        <button
          onClick={() => setUser(null)}
          className="bg-navy-900 text-white px-6 py-2 rounded-md hover:bg-navy-800 transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

export default App;