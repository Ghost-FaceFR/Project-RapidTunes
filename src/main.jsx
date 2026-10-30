import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";

// Désactive le menu contextuel natif du navigateur (les menus maison restent gérés par React).
// Phase de capture sur window: aucun stopPropagation d'un composant ne peut laisser passer le menu natif.
window.addEventListener("contextmenu", (event) => event.preventDefault(), true);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
