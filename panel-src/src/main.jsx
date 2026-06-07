import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { HassProvider } from "./lib/hass-context.jsx";
import "./index.css";

// Home Assistant charge les panels custom comme un élément personnalisé
// (cf. `_panel_custom.name` = "livebox-panel" dans __init__.py). HA pose les
// propriétés `hass`, `narrow`, `route`, `panel` sur l'élément et les met à
// jour à chaque changement d'état — on les relaie au contexte React.
class LiveboxPanel extends HTMLElement {
  _root = null;
  _hass = null;

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    if (!this._root) {
      const mountPoint = document.createElement("div");
      mountPoint.id = "root";
      this.appendChild(mountPoint);
      this._root = createRoot(mountPoint);
    }
    this._render();
  }

  _render() {
    if (!this._root) return;
    this._root.render(
      <StrictMode>
        <HassProvider hass={this._hass}>
          <App />
        </HassProvider>
      </StrictMode>,
    );
  }
}

customElements.define("livebox-panel", LiveboxPanel);
