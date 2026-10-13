import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
const phase = process.env.PROBANT_C01_BUILD_PHASE ?? "build-owned";
if (!/^[a-z0-9-]+$/.test(phase)) throw new Error("Invalid build evidence phase");
const output = "docs/recette/c01/" + phase;
if (existsSync(output + "/exit.json")) throw new Error("Build evidence already recorded");
await mkdir(output, { recursive: true });
const log = createWriteStream(output + "/build.log");
const startedAt = new Date().toISOString();
// Installed Next 15.5.27 config-shared.js reads this supported worker-count input.
// One static worker, with the usual build/type/lint checks and no relaxed criteria.
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CIRCLE_NODE_TOTAL: "2" },
});
await writeFile(output + "/process.json", JSON.stringify({ startedAt, pid: child.pid, node: process.version, staticWorkerInput: { CIRCLE_NODE_TOTAL: "2" }, method: "owned direct Next build, sequential verification" }, null, 2));
for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {
  log.write(chunk);
  for (const line of chunk.toString().split(/\r?\n/)) if (/Compiled|Linting|Creating|Collecting|Generating|Finalizing|Error|Failed/.test(line)) process.stdout.write(line + "\n");
});
const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => resolve({ code, signal })); });
log.end();
await writeFile(output + "/exit.json", JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), ...code }, null, 2));
process.exitCode = code.code ?? 1;
