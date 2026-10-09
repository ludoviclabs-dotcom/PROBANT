import { afterEach, expect, it, vi } from "vitest";
import {
  payrollDemoGET,
  payrollDemoPOST,
  payrollImportPOST,
  payrollRealDisabled,
  payrollFailure,
} from "../payroll-http";
const origin = "http://127.0.0.1:3018",
  url = origin + "/api/workpapers/paie/demo";
function local(body?: unknown, cookie?: string) {
  return new Request(url, {
    method: body ? "POST" : "GET",
    headers: { host: "127.0.0.1:3018", origin, ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
function enabled() {
  vi.stubEnv("PROBANT_DEMONSTRATION_ENABLED", "true");
  vi.stubEnv("PROBANT_DEMONSTRATION_ORIGIN", origin);
  vi.stubEnv("VERCEL_ENV", "");
}
afterEach(() => vi.unstubAllEnvs());
it("réel fermé sans lire une requête ou activer un flag", async () => {
  enabled();
  expect(payrollRealDisabled().status).toBe(503);
  expect(await payrollRealDisabled().text()).toContain("HR_REAL_DISABLED");
});
it("local désactivé par défaut, sur Vercel, hors origine ou hors loopback", async () => {
  expect((await payrollDemoGET(local())).status).toBe(503);
  enabled();
  vi.stubEnv("VERCEL_ENV", "preview");
  expect((await payrollDemoGET(local())).status).toBe(503);
  vi.stubEnv("VERCEL_ENV", "");
  expect(
    (
      await payrollDemoPOST(
        new Request(url, {
          method: "POST",
          headers: { host: "127.0.0.1:3018", origin: "https://foreign.test" },
          body: "{}",
        }),
      )
    ).status,
  ).toBe(503);
  vi.stubEnv("PROBANT_DEMONSTRATION_ORIGIN", "https://public.test");
  expect(
    (
      await payrollDemoGET(
        new Request("https://public.test/demo", {
          headers: { host: "public.test" },
        }),
      )
    ).status,
  ).toBe(503);
});
it("session serveur HttpOnly requise pour lire/importer; aucune identité forgée", async () => {
  enabled();
  expect((await payrollDemoGET(local())).status).toBe(401);
  expect((await payrollImportPOST(local({ invalid: true }))).status).toBe(401);
  const init = await payrollDemoPOST(
    local({ action: "init", scenario: "standard" }),
  );
  expect(init.status).toBe(200);
  const cookie = init.headers.get("set-cookie")!;
  expect(cookie).toContain("HttpOnly; SameSite=Strict");
  expect(
    (await payrollDemoGET(local(undefined, cookie.split(";")[0]))).status,
  ).toBe(200);
  expect(
    (
      await payrollDemoPOST(
        local({ action: "init", scenario: "empty", role: "hr-admin" }),
      )
    ).status,
  ).toBe(422);
});
it("erreurs et corps volumineux ne divulguent pas de données RH", async () => {
  enabled();
  const response = await payrollDemoPOST(
    local({ secret: "SYN-A01", content: "x".repeat(16001) }),
  );
  expect(response.status).toBe(413);
  expect(await response.text()).toBe('{"error":"HR_BODY_LIMIT"}');
  expect(
    await payrollFailure(Error("PRIVATE 50.00 employee NAME SQL")).text(),
  ).toBe('{"error":"HR_REQUEST_INVALID"}');
});
