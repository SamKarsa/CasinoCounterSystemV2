import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// El webview trae el menú contextual del navegador (Recargar, Inspeccionar...),
// que no pinta nada en una app de escritorio. Se escucha en fase de burbujeo, no
// de captura, para que los onContextMenu de React (el menú de rutas del sidebar)
// corran antes y sigan funcionando.
document.addEventListener("contextmenu", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
