# Logo Oralink

Logo original (pas le logo Orange, marque déposée) : carré orange arrondi en
dégradé + maillon blanc (pictogramme `link-variant` de
[Material Design Icons](https://pictogrammers.com/library/mdi/), licence
Apache 2.0), mot « oralink » en Roboto Bold.

- `icon.svg` → `brand/icon.png` (256) et `icon@2x.png` (512)
- `logo.svg` / `dark_logo.svg` → `brand/logo*.png`, `brand/dark_logo*.png`
  (256 / 512 px de haut, fond transparent ; variante sombre = texte clair)

Régénération (Chromium de Playwright) :
`CHROME=~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome node render.mjs`
depuis ce dossier, puis copier les PNG dans `custom_components/oralink/brand/`.
