import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { Linter } from "eslint";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { globSync } = require("../../../tools/fast-glob-compat/index.cjs") as {
  globSync(pattern: string, options: { onlyDirectories: true }): string[];
};
const posix = (value: string) => value.replace(/\\/g, "/");
let fixture: string;
const sub = (relative: string) => posix(path.join(fixture, relative));

beforeAll(() => {
  fixture = mkdtempSync(path.join(tmpdir(), "probant-next-root-glob-"));
  for (const relative of ["apps/alpha/app/test", "apps/beta/pages", "apps/alpha/nested/deep", "empty"]) {
    mkdirSync(path.join(fixture, relative), { recursive: true });
  }
  writeFileSync(path.join(fixture, "apps/alpha/app/test/page.tsx"), "export default function Page(){return null;}");
  writeFileSync(path.join(fixture, "apps/file.txt"), "not a directory");
  writeFileSync(path.join(fixture, "apps/beta/pages/test.tsx"), "export default function Page(){return null;}");
});

afterAll(() => {
  const resolved = path.resolve(fixture);
  const expectedParent = path.resolve(tmpdir());
  if (path.dirname(resolved) !== expectedParent || !path.basename(resolved).startsWith("probant-next-root-glob-")) {
    throw new Error("Refusing to remove a directory outside the owned temporary fixture");
  }
  rmSync(resolved, { recursive: true, force: true });
});

describe("Next root-directory dependency replacement", () => {
  it("matches literal directory roots without recursively including descendants or files", () => {
    expect(globSync(posix(fixture), { onlyDirectories: true })).toEqual([posix(fixture)]);
    const volumeRoot = posix(path.parse(fixture).root);
    expect(globSync(volumeRoot, { onlyDirectories: true })).toEqual([volumeRoot]);
    expect(globSync(sub("apps/alpha"), { onlyDirectories: true })).toEqual([sub("apps/alpha")]);
    expect(globSync(sub("apps/file.txt"), { onlyDirectories: true })).toEqual([]);
    expect(globSync(sub("absent"), { onlyDirectories: true })).toEqual([]);
  });

  it("preserves absolute, relative, brace and recursive directory glob results", () => {
    const roots = [sub("apps/alpha"), sub("apps/beta")];
    expect(globSync(sub("apps/*"), { onlyDirectories: true }).sort()).toEqual(roots);
    expect(globSync(sub("apps/{alpha,beta}"), { onlyDirectories: true }).sort()).toEqual(roots);
    const relativePattern = posix(path.relative(process.cwd(), sub("apps/*")));
    expect(globSync(relativePattern, { onlyDirectories: true }).sort()).toEqual(roots.map(root => posix(path.relative(process.cwd(), root))).sort());
    expect(globSync(sub("apps/**/deep"), { onlyDirectories: true })).toEqual([sub("apps/alpha/nested/deep")]);
  });

  it("keeps the actual Next plugin's string and array rootDir settings and internal-link rule active", () => {
    const { getRootDirs } = require("@next/eslint-plugin-next/dist/utils/get-root-dirs.js") as {
      getRootDirs(context: { cwd: string; settings: { next: { rootDir?: string | string[] } } }): string[];
    };
    const roots = [sub("apps/alpha"), sub("apps/beta")];
    expect(getRootDirs({ cwd: fixture, settings: { next: {} } })).toEqual([fixture]);
    expect(getRootDirs({ cwd: fixture, settings: { next: { rootDir: sub("apps/*") } } }).sort()).toEqual(roots);
    expect(getRootDirs({ cwd: fixture, settings: { next: { rootDir: roots } } }).sort()).toEqual(roots);
    const plugin = require("@next/eslint-plugin-next");
    const messages = new Linter().verify('<a href="/test">Test</a>', [{
      files: ["**/*.jsx"],
      languageOptions: { parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } } },
      plugins: { "@next/next": plugin },
      settings: { next: { rootDir: sub("apps/*") } },
      rules: { "@next/next/no-html-link-for-pages": "error" },
    }], { filename: "component.jsx" });
    expect(messages.some(message => message.ruleId === "@next/next/no-html-link-for-pages")).toBe(true);
  });

  it("rejects unsupported calls and deeply nested attack patterns before running a parser", () => {
    expect(() => globSync("a".repeat(4097), { onlyDirectories: true })).toThrow(/4096/);
    expect(() => globSync("{".repeat(65) + "x" + "}".repeat(65), { onlyDirectories: true })).toThrow(/nesting/);
    expect(() => globSync("(".repeat(65) + "x" + ")".repeat(65), { onlyDirectories: true })).toThrow(/nesting/);
    expect(() => globSync("{]".repeat(65) + "x", { onlyDirectories: true })).toThrow(/nesting/);
    expect(() => globSync("!".repeat(4), { onlyDirectories: true })).toThrow(/negated/);
    expect(() => globSync("apps/\u0000", { onlyDirectories: true })).toThrow(/NUL/);
    expect(() => globSync("apps", { onlyDirectories: false } as unknown as { onlyDirectories: true })).toThrow(/onlyDirectories/);
    expect(() => globSync("apps", { onlyDirectories: true, cwd: fixture } as { onlyDirectories: true })).toThrow(/onlyDirectories/);
  });

  it("actually removes vulnerable packages from the dependency lock instead of filtering audit output", () => {
    const lock = JSON.parse(readFileSync(path.join(process.cwd(), "package-lock.json"), "utf8")) as {
      packages: Record<string, { name?: string; resolved?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }>;
    };
    for (const [entry, dependency] of Object.entries(lock.packages)) {
      expect(entry).not.toMatch(/(?:^|\/)node_modules\/(?:braces|micromatch)$/);
      if (dependency.dependencies?.["fast-glob"] || dependency.devDependencies?.["fast-glob"] || dependency.optionalDependencies?.["fast-glob"]) {
        expect(["", "node_modules/@next/eslint-plugin-next"]).toContain(entry);
      }
    }
    const pluginRequire = createRequire(require.resolve("@next/eslint-plugin-next"));
    expect(pluginRequire("fast-glob/package.json").name).toBe("@probant/next-root-glob");
  });
});

describe("ExcelJS UUID security update compatibility", () => {
  it("round-trips extended conditional formatting that generates a CommonJS UUID v4", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Clients");
    sheet.addRows([[1000], [300], [700]]);
    sheet.addConditionalFormatting({
      ref: "A1:A3",
      rules: [{
        type: "dataBar",
        priority: 1,
        gradient: false,
        cfvo: [{ type: "min" }, { type: "max" }],
      }],
    });
    const bytes = await workbook.xlsx.writeBuffer();
    const restored = new ExcelJS.Workbook();
    await restored.xlsx.load(bytes);
    const restoredSheet = restored.getWorksheet("Clients")!;
    expect([1, 2, 3].map(row => restoredSheet.getCell("A" + row).value)).toEqual([1000, 300, 700]);
    // ExcelJS exposes this persisted field at runtime, but omits it from Worksheet declarations.
    const formatting = (restoredSheet as unknown as { conditionalFormattings: ExcelJS.ConditionalFormattingOptions[] }).conditionalFormattings;
    const rule = formatting[0].rules[0] as ExcelJS.DataBarRuleType & { x14Id?: string };
    expect(rule.type).toBe("dataBar");
    expect(rule.gradient).toBe(false);
    expect(rule.x14Id).toMatch(/^\{[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}\}$/);
  });
});
