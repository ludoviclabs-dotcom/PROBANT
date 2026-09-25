import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationDenied } from "@/lib/auth/principal";

const { authorizeRequest, createIngestionJob, list, get } = vi.hoisted(() => ({
  authorizeRequest: vi.fn(), createIngestionJob: vi.fn(), list: vi.fn(), get: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ authorizeRequest }));
vi.mock("@/lib/ingestion", () => ({
  createIngestionJob,
  getIngestionJobRepository: () => ({ kind: "memory", list, get }),
  isIngestionDocumentType: () => true,
  isPersistentIngestionConfigured: () => false,
  jsonError: (code: string, message: string, status: number) => Response.json({ code, message }, { status }),
  processIngestionJob: vi.fn(),
}));

import { GET as listJobs, POST as upload } from "@/app/api/ingestions/route";
import { GET as getJob } from "@/app/api/ingestions/[id]/route";
import { POST as processJob } from "@/app/api/ingestions/[id]/process/route";

const DOSSIER = "5b03f078-0e4c-4558-959c-eb2bfde26f49";
const OTHER = "05c82d49-6aa4-4e5c-bdc0-4c310761ba37";
const principal = { organizationId: "org-a" };
const job = { id: "job-1", organizationId: "org-a", dossierId: DOSSIER, status: "uploaded" };

function form(fields: Record<string, string> = {}) {
  const data = new FormData();
  data.set("dossierId", DOSSIER);
  data.set("file", new File(["fixture"], "123456789FEC20261231.txt", { type: "text/plain" }));
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return new Request("http://localhost/api/ingestions", { method: "POST", body: data });
}

describe("anciennes routes d'ingestion — cloisonnement", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authorizeRequest.mockResolvedValue(principal);
    list.mockResolvedValue([job, { ...job, id: "job-b", organizationId: "org-b", dossierId: OTHER }]);
    get.mockResolvedValue(job);
    createIngestionJob.mockResolvedValue({ job, validation: { ok: false, documentType: "unknown" } });
  });

  it("refuse l'accès anonyme avant de divulguer un job ou de traiter un fichier", async () => {
    authorizeRequest.mockRejectedValue(new AuthorizationDenied("AUTHENTICATION_REQUIRED", "Authentification requise.", 401));
    expect((await listJobs(new Request(`http://localhost/api/ingestions?dossierId=${DOSSIER}`))).status).toBe(401);
    expect((await getJob(new Request("http://localhost/api/ingestions/job-1"), { params: Promise.resolve({ id: "job-1" }) })).status).toBe(401);
    expect((await processJob(new Request("http://localhost/api/ingestions/job-1/process", { method: "POST" }), { params: Promise.resolve({ id: "job-1" }) })).status).toBe(401);
    expect((await getJob(new Request("http://localhost/api/ingestions/absent"), { params: Promise.resolve({ id: "absent" }) })).status).toBe(401);
    expect(get).not.toHaveBeenCalled();
    expect((await upload(form())).status).toBe(401);
    expect(createIngestionJob).not.toHaveBeenCalled();
  });

  it("rend un job étranger indistinguable d'un job absent", async () => {
    get.mockResolvedValueOnce(null);
    const missing = await getJob(new Request("http://localhost/api/ingestions/absent"), { params: Promise.resolve({ id: "absent" }) });
    get.mockResolvedValueOnce({ ...job, organizationId: "org-b" });
    const foreign = await getJob(new Request("http://localhost/api/ingestions/job-b"), { params: Promise.resolve({ id: "job-b" }) });
    expect(foreign.status).toBe(missing.status);
    expect(await foreign.json()).toEqual(await missing.json());
    expect(authorizeRequest).toHaveBeenCalledWith(expect.any(Request), { permission: "dossier:read" });
    get.mockResolvedValueOnce({ ...job, organizationId: "org-b" });
    expect((await processJob(new Request("http://localhost/api/ingestions/job-b/process", { method: "POST" }), { params: Promise.resolve({ id: "job-b" }) })).status).toBe(404);
  });

  it("ne révèle pas un job d'un dossier non autorisé dans la même organisation", async () => {
    get.mockResolvedValueOnce(null);
    const missing = await getJob(new Request("http://localhost/api/ingestions/absent"), { params: Promise.resolve({ id: "absent" }) });
    authorizeRequest.mockResolvedValueOnce(principal).mockRejectedValueOnce(new AuthorizationDenied("DOSSIER_FORBIDDEN", "Dossier non autorisé."));
    const restricted = await getJob(new Request("http://localhost/api/ingestions/job-1"), { params: Promise.resolve({ id: "job-1" }) });
    expect(restricted.status).toBe(missing.status);
    expect(await restricted.json()).toEqual(await missing.json());
    authorizeRequest.mockResolvedValueOnce(principal).mockRejectedValueOnce(new AuthorizationDenied("DOSSIER_FORBIDDEN", "Dossier non autorisé."));
    const processRestricted = await processJob(new Request("http://localhost/api/ingestions/job-1/process", { method: "POST" }), { params: Promise.resolve({ id: "job-1" }) });
    expect(processRestricted.status).toBe(404);
  });

  it("filtre la liste à l'organisation et au dossier autorisés", async () => {
    const response = await listJobs(new Request(`http://localhost/api/ingestions?dossierId=${DOSSIER}`));
    expect(response.status).toBe(200);
    expect((await response.json()).jobs).toEqual([job]);
    expect(authorizeRequest).toHaveBeenCalledWith(expect.any(Request), { permission: "dossier:read", dossierId: DOSSIER });
  });

  it("refuse un dossier d'une autre organisation et des identifiants de périmètre forgés", async () => {
    authorizeRequest.mockRejectedValueOnce(new AuthorizationDenied("DOSSIER_NOT_FOUND", "Dossier introuvable.", 403));
    expect((await upload(form({ dossierId: OTHER }))).status).toBe(403);
    expect((await upload(form({ organizationId: "org-b" }))).status).toBe(400);
    expect(createIngestionJob).not.toHaveBeenCalled();
  });

  it("refuse la traversée de chemin et transmet uniquement le périmètre serveur", async () => {
    expect((await upload(form({ dossierId: "../../autre" }))).status).toBe(400);
    expect(createIngestionJob).not.toHaveBeenCalled();
    expect((await upload(form())).status).toBe(202);
    expect(createIngestionJob).toHaveBeenCalledWith(expect.objectContaining({
      dossierId: DOSSIER, organizationId: "org-a", entityId: DOSSIER,
    }));
  });
});
