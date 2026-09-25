import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/workpapers/route";
import { workpaperReadHandler } from "../http";
import { WorkpaperService } from "../service";
import { MemoryWorkpaperRepository } from "../repository";
import { MemoryImportRepository } from "../imports";
import { syntheticRegistry } from "../calculations";
import { fixtureRun, scope, preparer } from "./fixtures";
describe("server URL boundary", () => {
  it("public reads and mutations are disabled without trusted auth/storage", async () => {
    expect(GET().status).toBe(503); expect(POST().status).toBe(503);
  });
  it("does not trust role/identity query parameters for read/download/projection", async () => {
    const repository = new MemoryWorkpaperRepository(); await repository.create(fixtureRun());
    const denied = workpaperReadHandler(new WorkpaperService(repository, new MemoryImportRepository(), syntheticRegistry()));
    const trusted = workpaperReadHandler(new WorkpaperService(repository, new MemoryImportRepository(), syntheticRegistry(), async () => preparer));
    const query = new URLSearchParams({ ...scope, id: "WP1", role: "reviewer", actorId: preparer.id });
    expect((await trusted(new Request(`http://local/api/workpapers?${query}`))).status).toBe(200);
    for (const operation of ["read", "download", "projection"]) {
      query.set("operation", operation);
      expect((await denied(new Request(`http://local/api/workpapers?${query}`))).status).toBe(403);
      query.set("dossierId", "other");
      expect((await trusted(new Request(`http://local/api/workpapers?${query}`))).status).toBe(403);
      query.set("dossierId", scope.dossierId);
    }
  });
});
