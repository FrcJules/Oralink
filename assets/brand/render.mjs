import { createRequire } from "node:module";
const require = createRequire("/home/appuser/.npm/_npx/e41f203b7505f1fb/node_modules/");
const { chromium } = require("playwright-core");
import { readFileSync } from "node:fs";
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME });
const jobs = [
  ["icon.svg", 256, 256, "icon.png"], ["icon.svg", 512, 512, "icon@2x.png"],
];
// Logo : largeur réelle du texte mesurée dans le navigateur, puis recadrage
for (const [svg, h, out] of [["logo.svg", 256, "logo.png"], ["logo.svg", 512, "logo@2x.png"], ["dark_logo.svg", 256, "dark_logo.png"], ["dark_logo.svg", 512, "dark_logo@2x.png"]]) jobs.push([svg, null, h, out]);
for (const [svg, w, h, out] of jobs) {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const src = readFileSync(svg, "utf8");
  await page.setContent(`<html><body style="margin:0;background:transparent">${src}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  let width = w;
  if (width === null) {   // largeur du logo = fin du texte + marge, à l'échelle demandée
    const box = await page.evaluate(() => { const s = document.querySelector("svg"); const b = s.getBBox(); return b.x + b.width; });
    width = Math.ceil((box + 24) * h / 512);
    await page.evaluate(([vw]) => { const s = document.querySelector("svg"); s.setAttribute("viewBox", `0 0 ${vw} 512`); }, [box + 24]);
  }
  await page.evaluate(([w, h]) => { const s = document.querySelector("svg"); s.setAttribute("width", w); s.setAttribute("height", h); }, [width, h]);
  await page.setViewportSize({ width, height: h });
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width, height: h } });
  console.log(out, `${width}x${h}`);
  await page.close();
}
await browser.close();
