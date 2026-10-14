import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalObjectStorage, LOCAL_BUCKET } from "../local-object-storage";

const SECRET = "s".repeat(48), KEY = "organizations/o1/dossiers/d1/documents/doc1/source";
const metadata = { organizationId: "o1", dossierId: "d1", sourceDocumentId: "doc1", ingestionJobId: "job1" };
const bytes = Buffer.from("JournalCode|JournalLib\nVE|Ventes\n", "utf8");
const base64 = createHash("sha256").update(bytes).digest("base64");
const roots: string[] = [];
function storage(now = () => 1_800_000_000_000) {
  const root = mkdtempSync(join(tmpdir(), "probant-pieces-")); roots.push(root);
  return { root, store: new LocalObjectStorage(root, "http://127.0.0.1:3210", SECRET, now) };
}
const body = (b: Buffer) => new Blob([new Uint8Array(b)]).stream();
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

async function grant(store: LocalObjectStorage, extra: Partial<Parameters<LocalObjectStorage["createDirectUpload"]>[0]> = {}) {
  const g = await store.createDirectUpload({ object: { provider: "local", bucket: LOCAL_BUCKET, key: KEY }, contentType: "text/plain", contentLength: bytes.length, checksumSha256Base64: base64, metadata, expiresInSeconds: 900, ...extra });
  return { g, token: new URL(g.url).searchParams.get("grant")! };
}

describe("C07 — stockage local des pièces, contrat ObjectStorage", () => {
  it("autorisation bornée vers le serveur local, envoi, métadonnées et octets relus à l'identique", async () => {
    const { root, store } = storage(), { g, token } = await grant(store);
    expect(g).toMatchObject({ method: "PUT", headers: { "content-type": "text/plain" }, expiresAt: new Date(1_800_000_000_000 + 900_000).toISOString() });
    expect(g.url.startsWith("http://127.0.0.1:3210/api/local/objects?grant=")).toBe(true);
    expect(token).not.toContain("doc1");
    expect(await store.receive(token, "text/plain", body(bytes))).toMatchObject({ key: KEY, contentLength: bytes.length });
    expect(readFileSync(join(root, ...KEY.split("/")))).toEqual(bytes);
    const ref = { provider: "local" as const, bucket: LOCAL_BUCKET, key: KEY };
    expect(await store.head(ref)).toEqual({ contentLength: bytes.length, contentType: "text/plain", checksumSha256Base64: base64, metadata: { organizationid: "o1", dossierid: "d1", sourcedocumentid: "doc1", ingestionjobid: "job1" } });
    expect(Buffer.from(await new Response(await store.read(ref)).arrayBuffer())).toEqual(bytes);
  });

  it("écriture unique : renvoyer les mêmes octets est idempotent, d'autres octets ne remplacent jamais l'original", async () => {
    const { root, store } = storage(), { token } = await grant(store);
    await store.receive(token, "text/plain", body(bytes));
    expect(await store.receive((await grant(store)).token, "text/plain", body(bytes))).toMatchObject({ key: KEY, contentLength: bytes.length });
    const unchecked = (await grant(store, { checksumSha256Base64: undefined })).token;
    await expect(store.receive(unchecked, "text/plain", body(Buffer.from("X".repeat(bytes.length))))).rejects.toMatchObject({ code: "LOCAL_OBJECT_ALREADY_STORED", status: 409 });
    expect(readFileSync(join(root, ...KEY.split("/")))).toEqual(bytes);
  });

  it("reprend une écriture interrompue avant la notice : mêmes octets complétés, autres octets refusés", async () => {
    const { root, store } = storage(), target = join(root, ...KEY.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes); // octets écrits, notice jamais écrite (arrêt du processus)
    expect(await store.receive((await grant(store)).token, "text/plain", body(bytes))).toMatchObject({ key: KEY, contentLength: bytes.length });
    expect((await store.head({ provider: "local", bucket: LOCAL_BUCKET, key: KEY })).checksumSha256Base64).toBe(base64);
    const other = storage(), otherTarget = join(other.root, ...KEY.split("/")), altered = Buffer.from("X".repeat(bytes.length));
    mkdirSync(dirname(otherTarget), { recursive: true });
    writeFileSync(otherTarget, altered);
    await expect(other.store.receive((await grant(other.store)).token, "text/plain", body(bytes))).rejects.toMatchObject({ code: "LOCAL_OBJECT_ALREADY_STORED", status: 409 });
    expect(readFileSync(otherTarget)).toEqual(altered);
  });

  it("refuse taille, type, empreinte, autorisation expirée ou falsifiée ; rien n'est écrit", async () => {
    const { root, store } = storage();
    const cases: [Buffer, string, string, string][] = [
      [Buffer.concat([bytes, Buffer.from("!")]), "text/plain", (await grant(store)).token, "LOCAL_UPLOAD_SIZE_MISMATCH"],
      [bytes.subarray(1), "text/plain", (await grant(store)).token, "LOCAL_UPLOAD_SIZE_MISMATCH"],
      [bytes, "text/csv", (await grant(store)).token, "LOCAL_UPLOAD_CONTENT_TYPE_MISMATCH"],
      [Buffer.from(bytes.toString().replace("VE", "AC")), "text/plain", (await grant(store)).token, "LOCAL_UPLOAD_CHECKSUM_MISMATCH"],
      [bytes, "text/plain", (await grant(store, { expiresInSeconds: -1 })).token, "LOCAL_UPLOAD_GRANT_EXPIRED"],
      [bytes, "text/plain", (await grant(store)).token.slice(0, -4) + "AAAA", "LOCAL_UPLOAD_GRANT_INVALID"],
    ];
    for (const [b, type, token, code] of cases) await expect(store.receive(token, type, body(b))).rejects.toMatchObject({ code });
    expect(existsSync(join(root, ...KEY.split("/")))).toBe(false);
    const other = new LocalObjectStorage(root, "http://127.0.0.1:3210", "t".repeat(48));
    await expect(other.receive((await grant(store)).token, "text/plain", body(bytes))).rejects.toMatchObject({ code: "LOCAL_UPLOAD_GRANT_INVALID" });
  });

  it("aucune clé ne sort du dossier des pièces ; un autre conteneur est refusé", async () => {
    const { store } = storage();
    for (const key of ["../secrets.local.json", "a/../../b", "a\\b", "", "a//b"]) await expect(store.head({ provider: "local", bucket: LOCAL_BUCKET, key })).rejects.toThrow("LOCAL_OBJECT_KEY_INVALID");
    await expect(store.head({ provider: "local", bucket: "autre", key: KEY })).rejects.toThrow("LOCAL_BUCKET_MISMATCH");
    await expect(store.head({ provider: "local", bucket: LOCAL_BUCKET, key: KEY })).rejects.toThrow("LOCAL_OBJECT_NOT_FOUND");
  });
});
