import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import path from "node:path";
import type { Browser, Page } from "@playwright/test";
import { leaseFiles } from "../lib/workpapers/lease-fixture";
import type { LeaseType } from "../lib/workpapers/lease-sources";

/**
 * Aides des parcours IFRS sur un profil personnel local jetable (L16-06, C03) : lanceur, connexion par lien local, API depuis la page,
 * contrôles d'écran (débordement, axe, mouvement). Le dossier du profil est toujours passé explicitement : un profil restauré a le sien.
 */
const AXE_PATH = path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js");
export const LEASE_TYPES: [LeaseType, string][] = [["lease_contracts", "Contrats"], ["lease_assumptions", "Hypothèses"], ["lease_schedule", "Échéances et règlements"], ["lease_ledger", "Comptabilité (612 / 613 / 614)"]];

export function launcher(home: string, command: string, extra: string[] = []) {
  const r = spawnSync(process.execPath, [path.join("scripts", "local", "probant-local.mjs"), command, "--home", home, ...extra], { encoding: "utf8", windowsHide: true, timeout: 900_000 });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}
function loginUrl(home: string, next = "/local") {
  const r = launcher(home, "login", ["--sans-navigateur", "--vers", next]);
  const url = /(http:\/\/127\.0\.0\.1:\d+\/api\/auth\/local\?code=[A-Za-z0-9_-]+&next=[^\s]+)/.exec(r.out)?.[1];
  if (!url) throw new Error("Lien de connexion introuvable : " + r.out);
  return url;
}
export async function signedInPage(browser: Browser, home: string, width: number, next = "/local") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "fr-FR", reducedMotion: "reduce", acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(loginUrl(home, next));
  return page;
}
export const portOpen = (port: number) => new Promise<boolean>(resolve => { const s = connect({ host: "127.0.0.1", port }, () => { s.destroy(); resolve(true); }); s.on("error", () => resolve(false)); });
export const profileConfig = (home: string) => JSON.parse(readFileSync(path.join(home, "probant.local.json"), "utf8")) as { postgres: { port: number }; app: { port: number }; owner: { name: string }; restoredFrom: string | null };
export async function noOverflow(page: Page) { return page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth + 1); }
export async function axeSerious(page: Page) {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[] }> } }).axe;
    const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.filter(v => v.impact === "serious" || v.impact === "critical").map(v => v.id + " " + v.nodes.slice(0, 3).map(n => n.target.join(" ")).join(" | "));
  });
}
export async function runningMotion(page: Page) { return page.evaluate(() => document.getAnimations().filter(a => a.playState === "running" && Number(a.effect?.getComputedTiming().duration ?? 0) > 10).length); }
export async function capture(page: Page, dir: string, name: string, fullPage = false) { mkdirSync(dir, { recursive: true }); await page.screenshot({ path: path.join(dir, name + ".jpg"), type: "jpeg", quality: 78, fullPage }); }
/** Server API from the page: the `__Host-` cookie of 127.0.0.1 is only sent by the browser. */
export async function api(page: Page, url: string, init: { json?: unknown; form?: Record<string, string | { name: string; type: string; text: string }> } = {}) {
  return page.evaluate(async ({ url, init }) => {
    const session = await (await fetch("/api/auth/session", { cache: "no-store" })).json();
    const headers: Record<string, string> = { "x-probant-csrf": session.csrfToken, "Idempotency-Key": crypto.randomUUID() };
    let body: BodyInit | undefined;
    if (init.form) { const form = new FormData(); for (const [k, v] of Object.entries(init.form)) form.set(k, typeof v === "string" ? v : new File([v.text], v.name, { type: v.type })); body = form; }
    else if (init.json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(init.json); }
    const r = await fetch(url, { method: body ? "POST" : "GET", headers, body, cache: "no-store" });
    return { status: r.status, body: await r.json().catch(() => null), hash: r.headers.get("X-Probant-Business-Hash") };
  }, { url, init });
}
export async function csv(type: LeaseType, edit?: Parameters<typeof leaseFiles>[0]) { const file = leaseFiles(edit)[type]!; return { name: file.name, text: await file.text() }; }
/** Status and message of a refused call, for an assertion that names the business code. */
export const refusal = (r: { status: number; body: { error?: string } | null }) => ({ status: r.status, error: r.body?.error ?? null });
