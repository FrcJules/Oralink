import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { HassProvider } from "./lib/hass-context.jsx";
import { ShadowContainerProvider } from "./lib/shadow-container-context.jsx";
import "./index.css";

// Home Assistant charge les panels custom comme un élément personnalisé
// (cf. `_panel_custom.name` = "livebox-panel" dans __init__.py). HA pose les
// propriétés `hass`, `narrow`, `route`, `panel` sur l'élément et les met à
// jour à chaque changement d'état — on les relaie au contexte React.
//
// On ouvre un Shadow DOM et on y pose nous-mêmes la feuille de style compilée
// (fichier séparé, servi statiquement à côté du bundle JS) : ça isole le CSS
// du panel de celui de Home Assistant dans les deux sens (pas de fuite des
// classes Tailwind vers le reste de l'UI HA, et pas d'écrasement des styles
// du panel par les styles globaux de HA). Un conteneur dédié est aussi posé
// dans le Shadow DOM pour servir de cible aux Portals Radix UI (Dialog,
// DropdownMenu...) — sans ça, ils se monteraient dans document.body, hors du
// Shadow DOM, donc sans aucun style.
class LiveboxPanel extends HTMLElement {
  _root = null;
  _hass = null;
  _portal = null;

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    if (this.shadowRoot) {
      this._render();
      return;
    }
    const shadow = this.attachShadow({ mode: "open" });

    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "/livebox_panel/react-panel/livebox-panel-react.css";
    shadow.appendChild(stylesheet);

    this._portal = document.createElement("div");
    this._portal.id = "radix-portal";
    shadow.appendChild(this._portal);

    const mountPoint = document.createElement("div");
    mountPoint.id = "root";
    shadow.appendChild(mountPoint);

    this._root = createRoot(mountPoint);
    this._render();
  }

  _render() {
    if (!this._root) return;
    this._root.render(
      <StrictMode>
        <ShadowContainerProvider value={this._portal}>
          <HassProvider hass={this._hass}>
            <App />
          </HassProvider>
        </ShadowContainerProvider>
      </StrictMode>,
    );
  }
}

if (!customElements.get("livebox-panel")) {
  customElements.define("livebox-panel", LiveboxPanel);
}
