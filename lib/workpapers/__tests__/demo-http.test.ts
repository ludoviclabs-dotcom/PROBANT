import { expect, it } from "vitest";
import { createDemoHttp } from "../demo-http";
function request(body: unknown) { return new Request("http://localhost/api/workpapers", { method: "PUT", headers: { "Content-Type": "application/json", "x-probant-demonstration": "synthetic-only" }, body: JSON.stringify(body) }); }
it("origine explicite du proxy local et refus d’une autre origine", async () => {
  const h = createDemoHttp(() => true, () => Date.now(), () => [], () => "http://127.0.0.1:3005");
  const r = request({ action: "create", parameters: { cycle: "clients", missingEvidence: true, methodAvailable: false } }); r.headers.set("origin", "http://127.0.0.1:3005");
  expect((await h(r)).status).toBe(200);
  const cross = request({}); cross.headers.set("origin", "https://attacker.invalid"); cross.headers.set("x-forwarded-host", "attacker.invalid");
  expect((await h(cross)).status).toBe(403);
  expect((await createDemoHttp(() => true, () => 0, () => [], () => "*")(request({}))).status).toBe(503);
});
it("opt-in obligatoire et refus des paramètres non synthétiques", async () => {
  expect((await createDemoHttp(() => false)(request({}))).status).toBe(503);
  const h = createDemoHttp(() => true);
  expect((await h(request({ action: "create", parameters: { cycle: "clients", missingEvidence: false, methodAvailable: false }, dossierId: "real" }))).status).toBe(400);
  expect((await h(request({ extra: "x".repeat(5000) }))).status).toBe(413);
});
it("préparer, soumettre, revoir et verrouiller une projection synthétique", async () => {
  const h = createDemoHttp(() => true);
  let r = await (await h(request({ action: "create", parameters: { cycle: "clients", missingEvidence: true, methodAvailable: false } }))).json();
  expect(r.run.state).toBe("executed");
  for (const action of ["submit", "approve", "lock"]) {
    const response = await h(request({ action, token: r.token, version: r.run.version, note: "Revue technique synthétique, aucune validation métier" }));
    expect(response.status).toBe(200); r = await response.json();
  }
  expect(r.run.state).toBe("locked"); expect(r.projection.lockedRuns).toHaveLength(1); expect(r.run.findings).toEqual([]);
  expect((await h(request({ action: "lock", token: r.token, version: 1, note: "stale" }))).status).toBe(409);
});
it("expiration et sessions inconnues ne réutilisent aucun dossier", async () => {
  let time = 0; const h = createDemoHttp(() => true, () => time);
  const r = await (await h(request({ action: "create", parameters: { cycle: "is", missingEvidence: true, methodAvailable: false } }))).json(); time = 31 * 60_000;
  expect((await h(request({ action: "submit", token: r.token, version: r.run.version, note: "expired" }))).status).toBe(404);
});
it("extinction de flag bloque aussi une session déjà préparée", async () => {
  let disabled = false; const h = createDemoHttp(() => true, () => Date.now(), () => disabled ? ["clients"] : []);
  const r = await (await h(request({ action: "create", parameters: { cycle: "clients", missingEvidence: true, methodAvailable: false } }))).json(); disabled = true;
  expect((await h(request({ action: "submit", token: r.token, version: r.run.version, note: "demo" }))).status).toBe(503);
});
it("correction conserve la note et crée une nouvelle révision à revoir", async () => {
  const h = createDemoHttp(() => true);
  let r = await (await h(request({ action: "create", parameters: { cycle: "clients", missingEvidence: true, methodAvailable: false } }))).json();
  const originalId = r.run.id;
  for (const action of ["submit", "changes", "revise", "submit", "approve"]) {
    const response = await h(request({ action, token: r.token, version: r.run.version, note: "Réponse synthétique : limite documentée, aucune preuve réelle ajoutée" }));
    expect(response.status).toBe(200); r = await response.json();
  }
  expect(r.run.id).not.toBe(originalId); expect(r.run.revision).toBe(2); expect(r.run.notes[0].resolution.text).toContain("limite documentée"); expect(r.run.state).toBe("approved");
});
