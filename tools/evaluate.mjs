// Evaluation Mode — Sprint 04
//
// Este script usa el renderer REAL (Three.js/WebGL2 vía Chromium headless),
// no una aproximación. Genera:
//   evaluation/Frame_000.png
//   evaluation/Frame_030.png
//   evaluation/Frame_060.png
//   evaluation/Frame_180.png
//   evaluation/review.json
//
// Requiere: npm install -D playwright   (ya en package.json)
//           npx playwright install chromium   (una sola vez, descarga el
//           binario — esto necesita acceso a internet sin restricciones,
//           por eso Claude no puede ejecutar este script en su propio
//           entorno de trabajo)
//
// Uso:
//   npm run build
//   npx serve dist -p 4173   (o cualquier servidor estático)
//   node tools/evaluate.mjs http://localhost:4173

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const TARGET_TIMES = [0, 30, 60, 180];
const OUT_DIR = path.resolve("evaluation");

async function main() {
  const baseUrl = process.argv[2];
  if (!baseUrl) {
    console.error("Uso: node tools/evaluate.mjs <url-del-dist-servido>");
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.goto(`${baseUrl}?eval=1`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !!(window).__phonema, { timeout: 15000 });

  const frames = [];

  for (const t of TARGET_TIMES) {
    await page.evaluate((seconds) => {
      (window).__phonema.advanceTo(seconds);
    }, t);

    const label = String(t).padStart(3, "0");
    const filePath = path.join(OUT_DIR, `Frame_${label}.png`);
    await page.screenshot({ path: filePath });

    const snapshot = await page.evaluate(() => (window).__phonema.getSnapshot());

    // Métricas de la captura real (no del estado interno): ocupación en
    // pantalla, histograma de luminancia, % de superficie en sombra
    // permanente. Se calculan sobre los píxeles del PNG recién generado.
    const pixelMetrics = await computePixelMetrics(page);

    frames.push({
      targetSeconds: t,
      file: `Frame_${label}.png`,
      simulation: snapshot,
      pixelMetrics
    });

    console.log(`Frame_${label}.png generado (t=${snapshot.elapsedSeconds.toFixed(2)}s real-simulado)`);
  }

  const review = {
    generatedAt: new Date().toISOString(),
    renderer: "Three.js WebGL2 real (Playwright/Chromium headless)",
    frames
  };

  writeFileSync(path.join(OUT_DIR, "review.json"), JSON.stringify(review, null, 2));
  console.log("review.json generado en", path.join(OUT_DIR, "review.json"));

  await browser.close();
}

// Calcula métricas directamente sobre los píxeles del canvas (no sobre
// el estado de la simulación) — ocupación en pantalla, histograma de
// luminancia, % de superficie en sombra permanente.
async function computePixelMetrics(page) {
  return page.evaluate(() => {
    const canvas = (window).__phonema.canvas;
    const w = canvas.width;
    const h = canvas.height;
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d");
    ctx.drawImage(canvas, 0, 0);
    const { data } = ctx.getImageData(0, 0, w, h);

    let litPixels = 0;
    let darkPixels = 0;
    let totalLuminance = 0;
    const histogram = new Array(16).fill(0);
    const BACKGROUND_THRESHOLD = 8; // fondo casi negro (#050505)
    const SHADOW_THRESHOLD = 20;

    let organismPixels = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      if (luminance > BACKGROUND_THRESHOLD) {
        organismPixels++;
        totalLuminance += luminance;
        if (luminance < SHADOW_THRESHOLD) darkPixels++;
        else litPixels++;
        histogram[Math.min(15, Math.floor(luminance / 16))]++;
      }
    }

    const totalPixels = w * h;

    return {
      screenOccupationPct: (organismPixels / totalPixels) * 100,
      averageLuminance: organismPixels > 0 ? totalLuminance / organismPixels : 0,
      percentPermanentlyShadowed: organismPixels > 0 ? (darkPixels / organismPixels) * 100 : 0,
      luminanceHistogram16Bins: histogram
    };
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
