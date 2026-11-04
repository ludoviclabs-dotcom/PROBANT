#!/usr/bin/env node
/**
 * Enregistre la « Visite guidée » en vidéo MP4, telle qu'un visiteur la voit : landing, clic sur « Lancer la
 * visite guidée », lecture automatique jusqu'à la conclusion (gestes « À vous » faits par la visite elle-même).
 *
 * La vidéo n'est pas versionnée : elle se régénère à chaque évolution des écrans, pour ne plus vieillir.
 *
 * Prérequis : un serveur PROBANT en mode démo (build de production conseillé), ffmpeg avec libx264.
 *   npm run build
 *   PROBANT_DEMONSTRATION_ENABLED=true PROBANT_DEMONSTRATION_ORIGIN=http://127.0.0.1:3200 npx next start -H 127.0.0.1 -p 3200
 *   node scripts/demo/record-visite.mjs --base http://127.0.0.1:3200 --out probant-visite-guidee.mp4
 *
 * Options : --base (URL du serveur), --out (fichier MP4), --chromium (exécutable Chromium si la version
 * installée diffère de @playwright/test). Capture : screencast Chromium (JPEG, 1440 × 900 à densité 2),
 * horodaté, recomposé à 30 images/s constantes (une image absente répète la précédente), sortie 1920 × 1200.
 */

import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const FPS = 30;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const base = arg("base", "http://127.0.0.1:3200");
const out = arg("out", "probant-visite-guidee.mp4");
const executablePath = arg("chromium", undefined);

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "fr-FR" });
const page = await context.newPage();
await page.goto(`${base}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const ffmpeg = spawn(
  "ffmpeg",
  ["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(FPS), "-i", "-",
    "-vf", "scale=1920:1200:flags=lanczos", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out],
  { stdio: ["pipe", "inherit", "inherit"] },
);

const cdp = await context.newCDPSession(page);
let t0 = null;
let written = 0;
let last = null;
const fillUntil = (timestamp) => {
  const target = Math.round((timestamp - t0) * FPS);
  while (last && written < target) {
    ffmpeg.stdin.write(last);
    written += 1;
  }
};
cdp.on("Page.screencastFrame", (frame) => {
  cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
  const ts = frame.metadata.timestamp;
  if (t0 === null) t0 = ts;
  fillUntil(ts);
  last = Buffer.from(frame.data, "base64");
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: 2880, maxHeight: 1800, everyNthFrame: 1 });

const start = Date.now();
await page.waitForTimeout(2500);
await page.getByRole("button", { name: /Lancer la visite guidée/ }).click();
// Dernière étape : la conclusion reste affichée, on lui laisse le temps de se composer.
await page.waitForFunction(() => document.querySelector("[data-tour-stage]")?.getAttribute("data-tour-stage") === "conclusion", null, { timeout: 300_000 });
await page.waitForTimeout(9000);
const end = Date.now();

await cdp.send("Page.stopScreencast");
if (t0 !== null) fillUntil(t0 + (end - start) / 1000 + 0.2);
ffmpeg.stdin.end();
await new Promise((resolve) => ffmpeg.on("close", resolve));
await browser.close();
console.log(`${out} · ${(written / FPS).toFixed(1)} s · ${FPS} i/s`);
