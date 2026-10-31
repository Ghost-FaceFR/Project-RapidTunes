import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./App.css";
import { installWebDebug, isWebDebug } from "./services/webDebug";

// Dans un navigateur (mode debug web), les commandes Tauri sont simulées avant le premier rendu.
installWebDebug()
  .catch((err) => console.warn("Simulation du mode debug web impossible:", err))
  .finally(() => {
    // Désactive le menu contextuel natif (les menus maison restent gérés par React).
    // Phase de capture sur window: aucun stopPropagation d'un composant ne peut laisser passer le menu natif.
    // En mode debug web, le menu natif reste disponible pour pouvoir inspecter un élément.
    if (!isWebDebug()) {
      window.addEventListener("contextmenu", (event) => event.preventDefault(), true);
    }

    ReactDOM.createRoot(document.getElementById("root")).render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    );
  });
