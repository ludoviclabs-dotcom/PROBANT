import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.join(process.cwd(), "scripts/generate-sbom.mjs");
const run = (cwd: string) => execFileSync(process.execPath, [script], {
  cwd,
  env: { ...process.env, SOURCE_DATE_EPOCH: "1234567890" },
  encoding: "utf8",
  maxBuffer: 4 * 1024 * 1024,
  stdio: ["ignore", "pipe", "pipe"],
});
type Component = {
  name: string;
  version: string;
  hashes?: { alg: string; content: string }[];
  properties?: { name: string; value: string }[];
};
type Bom = {
  metadata: { timestamp: string; properties: { name: string; value: string }[] };
  components: Component[];
};

function localFixture() {
  const fixture = mkdtempSync(path.join(tmpdir(), "probant-sbom-"));
  mkdirSync(path.join(fixture, "tools/adapter"), { recursive: true });
  writeFileSync(path.join(fixture, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0" }));
  writeFileSync(path.join(fixture, "package-lock.json"), JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": { name: "fixture", version: "1.0.0" },
      "node_modules/fast-glob": { resolved: "tools/adapter", link: true },
      "tools/adapter": { name: "@probant/next-root-glob", version: "1.0.0", dev: true },
    },
  }));
  writeFileSync(path.join(fixture, "tools/adapter/package.json"), JSON.stringify({
    name: "@probant/next-root-glob",
    version: "1.0.0",
    main: "index.cjs",
    files: ["index.cjs", "README.md"],
  }));
  writeFileSync(path.join(fixture, "tools/adapter/index.cjs"), "module.exports = {};\n");
  writeFileSync(path.join(fixture, "tools/adapter/README.md"), "Local replacement.\n");
  return fixture;
}

function cleanup(fixture: string) {
  const resolved = path.resolve(fixture);
  if (path.dirname(resolved) !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith("probant-sbom-")) {
    throw new Error("Refusing to remove a directory outside the owned temporary fixture");
  }
  rmSync(resolved, { recursive: true, force: true });
}

describe("Dependency SBOM provenance", () => {
  it("includes actual adapter/UUID identities and reproducible local source hashes", () => {
    const first = run(process.cwd());
    expect(run(process.cwd())).toBe(first);
    const bom = JSON.parse(first) as Bom;
    expect(bom.metadata.timestamp).toBe("2009-02-13T23:31:30.000Z");
    expect(bom.components.find(component => component.name === "uuid")?.version).toBe("11.1.1");
    expect(bom.components.some(component => component.name === "fast-glob")).toBe(false);
    const adapter = bom.components.find(component => component.name === "@probant/next-root-glob")!;
    expect(adapter.version).toBe("1.0.0");
    expect(adapter.hashes).toEqual([{ alg: "SHA-256", content: expect.stringMatching(/^[a-f0-9]{64}$/) }]);
    const fileIndex = JSON.parse(adapter.properties!.find(property => property.name === "probant:localSourceFilesSha256")!.value) as { path: string; sha256: string }[];
    expect(fileIndex.map(file => file.path)).toEqual(["README.md", "index.cjs", "package.json"]);
    expect(fileIndex.every(file => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
  }, 15000);

  it("changes source digest when local code changes even if lock and version do not", () => {
    const fixture = localFixture();
    try {
      const before = JSON.parse(run(fixture)) as Bom;
      writeFileSync(path.join(fixture, "tools/adapter/index.cjs"), "module.exports = { updated: true };\n");
      const after = JSON.parse(run(fixture)) as Bom;
      expect(after.metadata).toEqual(before.metadata);
      expect(after.components[0].hashes).not.toEqual(before.components[0].hashes);
      expect(after.components[0].name).toBe("@probant/next-root-glob");
    } finally {
      cleanup(fixture);
    }
  }, 15000);

  it("refuses a mismatched identity or source path outside the package", () => {
    const fixture = localFixture();
    try {
      writeFileSync(path.join(fixture, "tools/adapter/package.json"), JSON.stringify({
        name: "@probant/next-root-glob",
        version: "2.0.0",
        main: "index.cjs",
      }));
      expect(() => run(fixture)).toThrow(/identity differs/);
      writeFileSync(path.join(fixture, "escape.txt"), "outside the packaged adapter");
      writeFileSync(path.join(fixture, "tools/adapter/package.json"), JSON.stringify({
        name: "@probant/next-root-glob",
        version: "1.0.0",
        files: ["../../escape.txt"],
      }));
      expect(() => run(fixture)).toThrow(/escapes/);
    } finally {
      cleanup(fixture);
    }
  }, 15000);
});
