import { useState } from "react";
import "./App.css";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import type { User } from "./types";

function App() {
  const [user, setUser] = useState<User | null>(null);

  if (!user) {
    return <Login onLoginSuccess={setUser} />;
  }

  return <Dashboard user={user} onLogout={() => setUser(null)} />;
}

export default App;