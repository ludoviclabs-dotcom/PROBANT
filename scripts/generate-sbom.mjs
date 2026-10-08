#!/usr/bin/env node
/**
 * Génération d'un SBOM CycloneDX 1.5 depuis package-lock.json.
 * Sans dépendance tierce : arbre, versions et SRI proviennent du lock.
 * Les paquets locaux incluent leur identité et les SHA-256 de leurs fichiers.
 * SOURCE_DATE_EPOCH fixe l'horodatage pour une génération reproductible.
 * Usage : node scripts/generate-sbom.mjs [> sbom.cdx.json]
 */

import { readFile, realpath, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";

const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const manifest = JSON.parse(await readFile("package.json", "utf8"));
const epoch = Number(process.env.SOURCE_DATE_EPOCH);
const timestamp = new Date(Number.isFinite(epoch) && epoch > 0 ? epoch * 1_000 : 0).toISOString();

/** node_modules/a/node_modules/b → b. */
function packageNameOf(location) {
  const marker = "node_modules/";
  const index = location.lastIndexOf(marker);
  return index < 0 ? null : location.slice(index + marker.length);
}

function purlFor(name, version) {
  const [scope, bare] = name.startsWith("@") ? name.slice(1).split("/") : [null, name];
  return scope
    ? "pkg:npm/%40" + scope + "/" + bare + "@" + version
    : "pkg:npm/" + bare + "@" + version;
}

/**
 * A local package has no registry SRI. Hash the actual packaged files and
 * include a deterministic digest of their sorted path/digest index.
 */
async function localSourceHashes(location, entry) {
  const repositoryRoot = await realpath(process.cwd());
  const packageRoot = await realpath(path.resolve(location));
  if (!packageRoot.startsWith(repositoryRoot + path.sep)) {
    throw new Error("Local SBOM package escapes the repository: " + location);
  }
  const localManifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
  if (localManifest.name !== entry.name || localManifest.version !== entry.version) {
    throw new Error("Local SBOM package identity differs from lock: " + location);
  }
  const files = [...new Set(["package.json", localManifest.main, ...(localManifest.files ?? [])].filter(Boolean))].sort();
  const fileHashes = [];
  for (const file of files) {
    if (typeof file !== "string" || /[*?\[\]{}]/.test(file)) {
      throw new Error("Local SBOM package requires explicit file paths: " + location);
    }
    const resolved = await realpath(path.resolve(packageRoot, file));
    if (!resolved.startsWith(packageRoot + path.sep) || !(await stat(resolved)).isFile()) {
      throw new Error("Local SBOM package file escapes its package or is not a file: " + file);
    }
    fileHashes.push({
      path: file.replace(/\\/g, "/"),
      sha256: createHash("sha256").update(await readFile(resolved)).digest("hex"),
    });
  }
  return {
    hashes: [{ alg: "SHA-256", content: createHash("sha256").update(JSON.stringify(fileHashes)).digest("hex") }],
    properties: [
      { name: "probant:localSourcePath", value: location.replace(/\\/g, "/") },
      { name: "probant:localSourceFilesSha256", value: JSON.stringify(fileHashes) },
      { name: "probant:localSourceHashFormat", value: "SHA-256 of JSON path/SHA-256 index in sorted package file order" },
    ],
  };
}

const components = new Map();
for (const [location, entry] of Object.entries(lock.packages ?? {})) {
  if (location === "") continue;
  const name = entry.name ?? packageNameOf(location);
  if (!name || !entry.version) continue;
  const key = name + "@" + entry.version;
  if (components.has(key)) continue;

  const local = !location.includes("node_modules/") ? await localSourceHashes(location, entry) : null;
  const hashes = local?.hashes ?? [];
  // Registry integrity is SRI (sha512-base64); CycloneDX expects hex.
  if (typeof entry.integrity === "string") {
    const [algorithm, value] = entry.integrity.split("-");
    if (algorithm && value) {
      hashes.push({
        alg: algorithm.toUpperCase().replace("SHA", "SHA-"),
        content: Buffer.from(value, "base64").toString("hex"),
      });
    }
  }

  components.set(key, {
    type: "library",
    "bom-ref": purlFor(name, entry.version),
    name,
    version: entry.version,
    purl: purlFor(name, entry.version),
    scope: entry.dev ? "excluded" : "required",
    ...(entry.license ? { licenses: [{ license: { id: entry.license } }] } : {}),
    ...(entry.resolved ? { externalReferences: [{ type: "distribution", url: entry.resolved }] } : {}),
    ...(hashes.length > 0 ? { hashes } : {}),
    ...(local ? { properties: local.properties } : {}),
  });
}

const sorted = [...components.values()].sort((left, right) => left["bom-ref"].localeCompare(right["bom-ref"]));
const bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  metadata: {
    timestamp,
    component: {
      type: "application",
      "bom-ref": purlFor(manifest.name, manifest.version),
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
    },
    tools: [{ vendor: "PROBANT", name: "generate-sbom.mjs", version: "2" }],
    properties: [
      { name: "probant:lockfileVersion", value: String(lock.lockfileVersion) },
      { name: "probant:lockfileSha256", value: createHash("sha256").update(await readFile("package-lock.json")).digest("hex") },
    ],
  },
  components: sorted,
};

process.stdout.write(JSON.stringify(bom, null, 2) + "\n");
