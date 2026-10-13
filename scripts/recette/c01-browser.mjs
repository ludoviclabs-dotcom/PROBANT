import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Own one direct Next process. No npm shell, reused server, database or remote origin.
const phase = process.env.PROBANT_C01_PHASE ?? `run-${new Date().toISOString().replace(/\D/g, "")}`;
if (!/^[a-z0-9-]+$/.test(phase)) throw new Error("Invalid evidence phase");
const output = path.join("docs/recette/c01", phase);
if (["browser.json", "exit.json"].some(name => existsSync(path.join(output, name)))) throw new Error("Evidence phase already recorded; choose a fresh phase");
const origin = "http://127.0.0.1:3121";
await mkdir(output, { recursive: true });
let occupied = false;
try { await fetch(origin, { signal: AbortSignal.timeout(1000) }); occupied = true; } catch { /* A closed loopback port is expected. */ }
if (occupied) throw new Error("C01 port already occupied; refusing an unowned server");
const log = createWriteStream(path.join(output, "server.log"));
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3121"], {
  windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, NODE_ENV: "production", CSP_MODE: "report-only", PROBANT_DEMONSTRATION_ENABLED: "true", PROBANT_DEMONSTRATION_ORIGIN: origin },
});
server.stdout.pipe(log); server.stderr.pipe(log);
const closed = new Promise(resolve => server.once("exit", resolve));
try {
  let ready = false;
  for (let n = 0; n < 180; n++) {
    if (server.exitCode !== null) throw new Error("Owned Next process exited before readiness");
    try { const response = await fetch(origin, { signal: AbortSignal.timeout(1000) }); ready = response.ok; } catch { /* Starting. */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error("Owned Next process failed readiness");
  await writeFile(path.join(output, "server.json"), JSON.stringify({ startedAt: new Date().toISOString(), processId: server.pid, origin, node: process.version, buildId: (await readFile(".next/BUILD_ID", "utf8")).trim(), method: "direct owned Next process, fixed loopback origin, no reused server" }, null, 2));
  const tests = process.argv.slice(2);
  if (!tests.length) throw new Error("Explicit test selection required");
  const runner = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config", "playwright.c01.config.ts", ...tests], {
    windowsHide: true, shell: false, stdio: "inherit", env: { ...process.env, PROBANT_C01_PHASE: phase, PROBANT_C01_OWNED_SERVER: "true" },
  });
  const code = await new Promise((resolve, reject) => { runner.once("error", reject); runner.once("exit", resolve); });
  await writeFile(path.join(output, "exit.json"), JSON.stringify({ finishedAt: new Date().toISOString(), exitCode: code, selected: tests }, null, 2));
  process.exitCode = code ?? 1;
} finally {
  if (server.exitCode === null) server.kill();
  await closed;
  log.end();
}
