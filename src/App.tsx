import { useState } from "react";
import "./App.css";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import { maximizeWindow, restoreDefaultWindow } from "./lib/tauri";
import type { User } from "./types";

function App() {
  const [user, setUser] = useState<User | null>(null);

  // El redimensionado es cosmético: si falla (p. ej. en `npm run dev`, sin
  // bridge de Tauri) no debe romper el login ni el logout.
  const handleLoginSuccess = (loggedIn: User) => {
    setUser(loggedIn);
    maximizeWindow().catch(() => {});
  };

  const handleLogout = () => {
    setUser(null);
    restoreDefaultWindow().catch(() => {});
  };

  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return <Dashboard user={user} onLogout={handleLogout} />;
}

export default App;
