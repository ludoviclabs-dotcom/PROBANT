#!/usr/bin/env node
/**
 * Génération d'un SBOM CycloneDX 1.5 depuis `package-lock.json`.
 *
 * Sans dépendance : le lockfile est déjà la description exacte et
 * reproductible de l'arbre installé. Un générateur tiers ajouterait une
 * dépendance de chaîne d'approvisionnement à un artefact dont le rôle est
 * précisément de documenter la chaîne d'approvisionnement.
 *
 * L'horodatage est injecté (`SOURCE_DATE_EPOCH`) et non lu de l'horloge :
 * deux exécutions sur le même lockfile doivent produire le même fichier.
 *
 * Usage : node scripts/generate-sbom.mjs [> sbom.cdx.json]
 */

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import process from "node:process";

const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const manifest = JSON.parse(await readFile("package.json", "utf8"));

const epoch = Number(process.env.SOURCE_DATE_EPOCH);
const timestamp = new Date(
  Number.isFinite(epoch) && epoch > 0 ? epoch * 1_000 : 0,
).toISOString();

/** `node_modules/a/node_modules/b` → `b`. */
function packageNameOf(location) {
  const marker = "node_modules/";
  const index = location.lastIndexOf(marker);
  return index < 0 ? null : location.slice(index + marker.length);
}

function purlFor(name, version) {
  const [scope, bare] = name.startsWith("@") ? name.slice(1).split("/") : [null, name];
  return scope
    ? `pkg:npm/%40${scope}/${bare}@${version}`
    : `pkg:npm/${bare}@${version}`;
}

const components = new Map();
for (const [location, entry] of Object.entries(lock.packages ?? {})) {
  if (location === "") continue;
  const name = packageNameOf(location);
  if (!name || !entry.version) continue;
  const key = `${name}@${entry.version}`;
  if (components.has(key)) continue;

  const hashes = [];
  // `integrity` est du SRI (`sha512-<base64>`) ; CycloneDX attend de l'hex.
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
  });
}

const sorted = [...components.values()].sort((left, right) =>
  left["bom-ref"].localeCompare(right["bom-ref"]),
);

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
    tools: [{ vendor: "PROBANT", name: "generate-sbom.mjs", version: "1" }],
    properties: [
      { name: "probant:lockfileVersion", value: String(lock.lockfileVersion) },
      {
        name: "probant:lockfileSha256",
        value: createHash("sha256")
          .update(await readFile("package-lock.json"))
          .digest("hex"),
      },
    ],
  },
  components: sorted,
};

process.stdout.write(`${JSON.stringify(bom, null, 2)}\n`);
