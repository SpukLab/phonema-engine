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

// Denso en 0-10s: es exactamente la ventana donde la Narrative Review
// reportó los momentos de atención (t=2s, 2s, 5s) — antes no medíamos
// nada ahí, saltábamos directo de 0s a 15s.
const TARGET_TIMES = [0, 1, 2, 3, 5, 8, 10, 15, 30, 45, 60, 90, 120, 150, 180];

async function main() {
  const baseUrl = process.argv[2];
  const label = process.argv[3] || "run";
  if (!baseUrl) {
    console.error("Uso: node tools/evaluate.mjs <url> [label]");
    console.error("Ejemplo experimento A/B (Sprint 05):");
    console.error('  node tools/evaluate.mjs "http://localhost:4173" with-revelation');
    console.error('  node tools/evaluate.mjs "http://localhost:4173?revelation=off" without-revelation');
    process.exit(1);
  }

  const OUT_DIR = path.resolve("evaluation", label);
  mkdirSync(OUT_DIR, { recursive: true });

  // Chromium headless, sin estos flags, muchas veces no expone un
  // contexto WebGL utilizable (ni GPU real ni software fallback). Esa
  // es la causa más probable de un canvas en blanco — no algo que se
  // pueda diagnosticar solo mirando la captura final.
  const browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--enable-unsafe-swiftshader"
    ]
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // WebGL por software (SwiftShader) es órdenes de magnitud más lento que
  // GPU real. Avanzar la simulación varios "segundos simulados" puede
  // tardar minutos reales bajo software rendering — no es un cuelgue,
  // es el costo real de renderizar sin GPU. Los 30s por defecto de
  // Playwright para cualquier acción son insuficientes acá.
  page.setDefaultTimeout(300000);

  // Diagnóstico real: si algo falla, queremos verlo en la consola, no
  // adivinarlo después mirando un PNG en blanco.
  page.on("console", (msg) => console.log(`[browser:${msg.type()}]`, msg.text()));
  page.on("pageerror", (err) => console.error("[pageerror]", err));
  page.on("requestfailed", (req) =>
    console.error("[requestfailed]", req.url(), req.failure()?.errorText)
  );

  const evalUrl = new URL(baseUrl);
  evalUrl.searchParams.set("eval", "1");
  await page.goto(evalUrl.toString(), { waitUntil: "networkidle" });

  // Verificación explícita de que estamos parados sobre la app real y
  // no sobre una página de error en blanco, antes de asumir cualquier cosa.
  const pageCheck = await page.evaluate(() => ({
    title: document.title,
    url: window.location.href,
    hasCanvas: !!document.querySelector("canvas"),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    webgl2Available: !!document.createElement("canvas").getContext("webgl2")
  }));
  console.log("Verificación de página:", pageCheck);

  if (!pageCheck.hasCanvas || !pageCheck.webgl2Available) {
    console.error(
      "ABORTANDO: no hay canvas o WebGL2 no está disponible en este navegador headless. " +
      "Las capturas siguientes no serían válidas para revisión."
    );
    await browser.close();
    process.exit(1);
  }

  await page.waitForFunction(() => !!(window).__phonema, { timeout: 15000 });

  const frames = [];

  for (const t of TARGET_TIMES) {
    const stepStart = Date.now();
    console.log(`Avanzando simulacion a t=${t}s (esto puede tardar varios minutos bajo software rendering)...`);

    await page.evaluate((seconds) => {
      (window).__phonema.advanceTo(seconds);
    }, t);

    console.log(`  avance completado en ${((Date.now() - stepStart) / 1000).toFixed(1)}s reales`);

    const label = String(t).padStart(3, "0");
    const filePath = path.join(OUT_DIR, `Frame_${label}.png`);
    await page.screenshot({ path: filePath, timeout: 300000 });

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
    label,
    url: evalUrl.toString(),
    frames
  };

  // Chequeo automático del fallo que ya vimos una vez: si todos los
  // frames tienen exactamente la misma ocupación en pantalla y
  // luminancia promedio, probablemente el canvas nunca dibujó nada.
  const occupations = frames.map((f) => f.pixelMetrics.screenOccupationPct);
  const allIdentical = occupations.every((o) => o === occupations[0]);
  if (allIdentical) {
    review.warning =
      "Todos los frames tienen la misma ocupación en pantalla — probablemente " +
      "el canvas no renderizó nada real. No usar estas imágenes para el ART REVIEW.";
    console.error("ADVERTENCIA:", review.warning);
  }

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
