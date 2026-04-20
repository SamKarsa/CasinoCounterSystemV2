import "./App.css";

function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-blue-900 mb-4">
          🎰 Casino Counter System
        </h1>
        <p className="text-gray-600 text-lg mb-2">
          Versión 2.0 - Tauri + React
        </p>
        <p className="text-gray-400 text-sm">
          Sistema de gestión de contadores
        </p>
        <div className="mt-8">
          <button className="bg-blue-900 text-white px-8 py-3 rounded-lg hover:bg-blue-800 transition-colors shadow-lg font-semibold">
            Comenzar →
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;