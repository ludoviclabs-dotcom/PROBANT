import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { constants } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { Readable } from "node:stream";
import { ApiError } from "@/lib/api/errors";
import { seal, SealedCookieError, unseal } from "@/lib/auth/sealed-cookie";
import type { DirectUploadGrant, DirectUploadRequest, ObjectStorage, StoredObjectMetadata, StoredObjectRef } from "./types";

/**
 * Stockage des pièces sur le PC — profil personnel local (C07).
 *
 * Même contrat que `S3ObjectStorage` : le serveur choisit la clé, le navigateur
 * reçoit une autorisation d'envoi bornée (taille, type, empreinte, durée) et
 * envoie les octets directement ; la finalisation relit les métadonnées avant de
 * publier le traitement. Ici l'URL vise `PUT /api/local/objects` du serveur local
 * et l'autorisation est scellée (AES-GCM) avec le secret de session du profil.
 *
 * Les octets originaux sont écrits une seule fois (copie exclusive, jamais d'écrasement),
 * avec leur SHA-256 dans une notice voisine. Rien n'est envoyé hors du PC.
 */
export const LOCAL_BUCKET = "probant-local";
export const LOCAL_UPLOAD_PATH = "/api/local/objects";
const GRANT_PURPOSE = "local-object-upload";
const KEY = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/;

interface UploadGrantPayload {
  key: string; contentType: string; contentLength: number; checksumSha256Base64?: string;
  metadata: DirectUploadRequest["metadata"]; expiresAtEpochMs: number;
}
interface Notice { contentLength: number; contentType: string; sha256: string; checksumSha256Base64: string; metadata: Record<string, string>; storedAt: string }

export class LocalObjectStorage implements ObjectStorage {
  readonly provider = "local" as const;
  readonly bucket = LOCAL_BUCKET;
  readonly maxDirectUploadBytes = 5 * 1024 * 1024 * 1024;

  constructor(private readonly root: string, private readonly appOrigin: string, private readonly secret: string, private readonly now: () => number = () => Date.now()) {
    if (!root) throw new Error("LOCAL_STORAGE_ROOT_NOT_CONFIGURED");
  }

  /** Fichier d'une clé, toujours sous la racine des pièces. */
  private file(object: Pick<StoredObjectRef, "bucket" | "key">): string {
    if (object.bucket !== this.bucket) throw new Error("LOCAL_BUCKET_MISMATCH");
    if (!KEY.test(object.key)) throw new Error("LOCAL_OBJECT_KEY_INVALID");
    const file = resolve(this.root, ...object.key.split("/"));
    const rel = relative(resolve(this.root), file);
    if (!rel || rel.startsWith("..")) throw new Error("LOCAL_OBJECT_KEY_INVALID");
    return file;
  }

  async createDirectUpload(request: DirectUploadRequest): Promise<DirectUploadGrant> {
    this.file(request.object);
    if (request.contentLength > this.maxDirectUploadBytes) throw new Error("LOCAL_UPLOAD_LIMIT_EXCEEDED");
    const expiresAtEpochMs = this.now() + request.expiresInSeconds * 1000;
    const payload: UploadGrantPayload = { key: request.object.key, contentType: request.contentType, contentLength: request.contentLength, ...(request.checksumSha256Base64 ? { checksumSha256Base64: request.checksumSha256Base64 } : {}), metadata: request.metadata, expiresAtEpochMs };
    return {
      method: "PUT",
      url: this.appOrigin + LOCAL_UPLOAD_PATH + "?grant=" + encodeURIComponent(seal(payload, this.secret, GRANT_PURPOSE)),
      headers: { "content-type": request.contentType },
      expiresAt: new Date(expiresAtEpochMs).toISOString(),
    };
  }

  /** Réception d'un envoi autorisé : taille, type et empreinte vérifiés avant l'écriture définitive. */
  async receive(grantToken: string, contentType: string | null, body: ReadableStream<Uint8Array> | null): Promise<{ key: string; sha256: string; contentLength: number }> {
    let grant: UploadGrantPayload;
    try { grant = unseal(grantToken, this.secret, GRANT_PURPOSE) as UploadGrantPayload; }
    catch (error) { if (error instanceof SealedCookieError) throw new ApiError("LOCAL_UPLOAD_GRANT_INVALID", "Autorisation d'envoi invalide.", 403); throw error; }
    if (!grant || typeof grant.key !== "string" || grant.expiresAtEpochMs < this.now()) throw new ApiError("LOCAL_UPLOAD_GRANT_EXPIRED", "Autorisation d'envoi expirée.", 403);
    if ((contentType ?? "").toLowerCase() !== grant.contentType.toLowerCase()) throw new ApiError("LOCAL_UPLOAD_CONTENT_TYPE_MISMATCH", "Type de contenu différent de l'autorisation.", 422);
    if (!body) throw new ApiError("LOCAL_UPLOAD_BODY_REQUIRED", "Corps d'envoi absent.", 400);
    const target = this.file({ bucket: this.bucket, key: grant.key }), temp = join(this.root, ".envois", randomUUID());
    await mkdir(dirname(temp), { recursive: true }); await mkdir(dirname(target), { recursive: true });
    const hash = createHash("sha256"), out = createWriteStream(temp, { flags: "wx" });
    let size = 0;
    try {
      const reader = body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > grant.contentLength) { await reader.cancel(); throw new ApiError("LOCAL_UPLOAD_SIZE_MISMATCH", "Taille supérieure à l'autorisation.", 413); }
        hash.update(value);
        if (!out.write(value)) await new Promise<void>(r => out.once("drain", () => r()));
      }
      await new Promise<void>((ok, ko) => out.end((error?: Error | null) => error ? ko(error) : ok()));
      if (size !== grant.contentLength) throw new ApiError("LOCAL_UPLOAD_SIZE_MISMATCH", "Taille différente de l'autorisation.", 422);
      const digest = hash.digest(), base64 = digest.toString("base64");
      if (grant.checksumSha256Base64 && grant.checksumSha256Base64 !== base64) throw new ApiError("LOCAL_UPLOAD_CHECKSUM_MISMATCH", "Empreinte différente de l'autorisation.", 422);
      const notice: Notice = { contentLength: size, contentType: grant.contentType, sha256: digest.toString("hex"), checksumSha256Base64: base64,
        metadata: { organizationid: grant.metadata.organizationId, dossierid: grant.metadata.dossierId, sourcedocumentid: grant.metadata.sourceDocumentId, ingestionjobid: grant.metadata.ingestionJobId }, storedAt: new Date(this.now()).toISOString() };
      // Écriture unique : la copie exclusive échoue si la pièce existe déjà ; la notice suit les octets.
      // Renvoyer exactement les mêmes octets (reprise d'une intention non finalisée) est idempotent ;
      // des octets différents ne remplacent jamais l'original.
      const existing = await readFile(target + ".notice.json", "utf8").then(text => JSON.parse(text) as Notice, () => null);
      if (existing) {
        if (existing.sha256 === notice.sha256 && existing.contentLength === notice.contentLength) return { key: grant.key, sha256: existing.sha256, contentLength: existing.contentLength };
        throw new ApiError("LOCAL_OBJECT_ALREADY_STORED", "Pièce déjà enregistrée : l'original n'est jamais remplacé.", 409);
      }
      const stored = (error: NodeJS.ErrnoException) => { if (error?.code === "EEXIST") throw new ApiError("LOCAL_OBJECT_ALREADY_STORED", "Pièce déjà enregistrée : l'original n'est jamais remplacé.", 409); throw error; };
      // Reprise d'une écriture interrompue entre les octets et la notice : la pièce présente n'est
      // complétée que si ce sont exactement les mêmes octets ; sinon elle reste intacte et l'envoi est refusé.
      const orphan = await readFile(target).catch((error: NodeJS.ErrnoException) => { if (error?.code === "ENOENT") return null; throw error; });
      if (orphan) {
        if (orphan.length !== notice.contentLength || createHash("sha256").update(orphan).digest("hex") !== notice.sha256) throw new ApiError("LOCAL_OBJECT_ALREADY_STORED", "Pièce déjà enregistrée : l'original n'est jamais remplacé.", 409);
      } else {
        await copyFile(temp, target, constants.COPYFILE_EXCL).catch(stored);
      }
      await writeFile(target + ".notice.json", JSON.stringify(notice), { flag: "wx" }).catch(stored);
      return { key: grant.key, sha256: notice.sha256, contentLength: size };
    } catch (error) {
      out.destroy();
      throw error;
    } finally {
      await rm(temp, { force: true });
    }
  }

  async head(object: StoredObjectRef): Promise<StoredObjectMetadata> {
    const file = this.file(object);
    const notice = JSON.parse(await readFile(file + ".notice.json", "utf8").catch(() => { throw new Error("LOCAL_OBJECT_NOT_FOUND"); })) as Notice;
    return { contentLength: notice.contentLength, contentType: notice.contentType, checksumSha256Base64: notice.checksumSha256Base64, metadata: notice.metadata };
  }

  async read(object: StoredObjectRef): Promise<ReadableStream<Uint8Array>> {
    return Readable.toWeb(createReadStream(this.file(object))) as ReadableStream<Uint8Array>;
  }

  async deleteAbandoned(object: StoredObjectRef): Promise<void> {
    const file = this.file(object);
    await rm(file, { force: true }); await rm(file + ".notice.json", { force: true });
  }
}

export function localPiecesRoot(env: Record<string, string | undefined> = process.env): string {
  const home = env.PROBANT_LOCAL_HOME?.trim();
  if (!home) throw new Error("LOCAL_HOME_MISSING");
  return join(home, "pieces");
}
