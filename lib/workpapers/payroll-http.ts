import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  mappingSchema,
  payrollKinds,
  authorizePayroll,
} from "./payroll-contract";
import { payrollActor, payrollFixture, payrollScope } from "./payroll-fixture";
import { PayrollRuntime } from "./payroll-runtime";

export const payrollHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
const cookieName = "probant_hr_synthetic";
const sessions = new Map<
  string,
  { created: number; runtime: PayrollRuntime }
>();
const initSchema = z
  .object({
    action: z.literal("init"),
    scenario: z.enum([
      "standard",
      "empty",
      "partial",
      "mapping_unknown",
      "rules_unknown",
    ]),
  })
  .strict();

/** Local synthetic sandbox only; no environment option enables real HR processing. */
export function requirePayrollDemo(request: Request) {
  try {
    const configured = new URL(process.env.PROBANT_DEMONSTRATION_ORIGIN ?? "");
    const actual = new URL(request.url);
    if (
      process.env.PROBANT_DEMONSTRATION_ENABLED !== "true" ||
      process.env.VERCEL_ENV ||
      !["localhost", "127.0.0.1", "[::1]"].includes(configured.hostname) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(actual.hostname) ||
      configured.protocol !== actual.protocol ||
      configured.host !== request.headers.get("host") ||
      (request.method !== "GET" &&
        request.headers.get("origin") !== configured.origin) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw Error();
  } catch {
    throw Error("HR_DEMONSTRATION_DISABLED");
  }
}

async function boundedBytes(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit)
    throw Error("HR_BODY_LIMIT");
  const reader = request.body?.getReader();
  if (!reader) throw Error("HR_BODY_REQUIRED");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw Error("HR_BODY_LIMIT");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function session(request: Request) {
  const id = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  const s = id && /^[a-f0-9]{64}$/.test(id) ? sessions.get(id) : undefined;
  if (!s || Date.now() - s.created > 30 * 60 * 1000) {
    if (id) sessions.delete(id);
    throw Error("HR_SESSION_REQUIRED");
  }
  return s.runtime;
}

export function payrollFailure(error: unknown) {
  // Allowlist only; parser errors can contain raw HR values and must never leave this boundary.
  const publicCodes = [
    "HR_DEMONSTRATION_DISABLED",
    "HR_SESSION_REQUIRED",
    "HR_BODY_LIMIT",
    "HR_VERSION_CONFLICT",
    "HR_PREVIEW_STALE",
    "HR_REVIEW_STALE",
    "HR_FORMAT_UNSUPPORTED",
    "HR_IMPORT_LIMIT",
    "HR_DUPLICATE_ROW",
    "HR_MAPPING_INVALID",
    "HR_FORBIDDEN",
    "HR_EVIDENCE_REQUIRED",
    "HR_IMPORT_INVALID",
    "HR_SESSION_LIMIT",
    "HR_PREVIEW_LIMIT",
  ];
  const code =
    error instanceof Error && publicCodes.includes(error.message)
      ? error.message
      : "HR_REQUEST_INVALID";
  const status =
    code === "HR_DEMONSTRATION_DISABLED"
      ? 503
      : code === "HR_SESSION_REQUIRED"
        ? 401
        : code === "HR_FORBIDDEN"
          ? 403
          : code.includes("STALE") || code === "HR_VERSION_CONFLICT"
            ? 409
            : code === "HR_BODY_LIMIT"
              ? 413
              : 422;
  return Response.json({ error: code }, { status, headers: payrollHeaders });
}

async function payrollTemplateResponse(kindValue: string | null) {
  // Fixed server-side permission for this export, before inspecting its input.
  authorizePayroll(payrollActor, payrollScope, "export");
  const kind = z.enum(payrollKinds).parse(kindValue);
  const header = (await payrollFixture().files[kind].text()).split("\n")[0];
  return new Response(header + "\n", {
    headers: {
      ...payrollHeaders,
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": `attachment; filename="colonnes-${kind}.csv"`,
    },
  });
}

export async function payrollDemoGET(request: Request) {
  try {
    requirePayrollDemo(request);
    const runtime = session(request);
    // Every read requires the trusted server principal's HR capability;
    // query parameters only choose the response, never whether to authorize.
    authorizePayroll(payrollActor, payrollScope, "read");
    const params = new URL(request.url).searchParams;
    if (
      [...params.keys()].some((k) => !["operation", "kind"].includes(k)) ||
      [...params.keys()].some((k) => params.getAll(k).length !== 1)
    )
      throw Error("HR_QUERY_INVALID");
    if (params.get("operation") === "diagnostic") {
      return Response.json(runtime.diagnostic(payrollActor), {
        headers: {
          ...payrollHeaders,
          "Content-Disposition":
            'attachment; filename="paie-diagnostic-technique.json"',
        },
      });
    }
    if (params.get("operation") === "template") {
      return await payrollTemplateResponse(params.get("kind"));
    }
    if (params.size) throw Error("HR_QUERY_INVALID");
    return Response.json(runtime.read(payrollActor), {
      headers: payrollHeaders,
    });
  } catch (e) {
    return payrollFailure(e);
  }
}

export async function payrollDemoPOST(request: Request) {
  try {
    requirePayrollDemo(request);
    const payload = JSON.parse(
      new TextDecoder().decode(await boundedBytes(request, 16000)),
    );
    if (payload?.action === "init") {
      const input = initSchema.parse(payload);
      for (const [key, value] of sessions)
        if (Date.now() - value.created > 30 * 60 * 1000) sessions.delete(key);
      if (sessions.size >= 16) throw Error("HR_SESSION_LIMIT");
      const runtime = await PayrollRuntime.create(input.scenario),
        id = randomBytes(32).toString("hex");
      // Replace only this local sandbox, never a durable dossier.
      const old = request.headers
        .get("cookie")
        ?.match(/(?:^|;\s*)probant_hr_synthetic=([a-f0-9]{64})(?:;|$)/)?.[1];
      if (old) sessions.delete(old);
      sessions.set(id, { created: Date.now(), runtime });
      return Response.json(runtime.read(payrollActor), {
        headers: {
          ...payrollHeaders,
          "Set-Cookie": `${cookieName}=${id}; HttpOnly; SameSite=Strict; Path=/api/workpapers/paie/demo; Max-Age=1800${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
        },
      });
    }
    return Response.json(
      await session(request).command(payrollActor, payload),
      { headers: payrollHeaders },
    );
  } catch (e) {
    return payrollFailure(e);
  }
}

export async function payrollImportPOST(request: Request) {
  try {
    requirePayrollDemo(request);
    const runtime = session(request); // Before consuming a potentially sensitive upload.
    const bytes = await boundedBytes(request, 1100000);
    const type = request.headers.get("content-type") ?? "";
    if (!type.startsWith("multipart/form-data;"))
      throw Error("HR_FORMAT_UNSUPPORTED");
    const form = await new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": type },
      body: bytes,
    }).formData();
    if (
      [...form.keys()].some((k) => !["file", "mapping"].includes(k)) ||
      form.getAll("file").length !== 1 ||
      form.getAll("mapping").length !== 1
    )
      throw Error("HR_FORM_INVALID");
    const file = form.get("file"),
      mapping = form.get("mapping");
    if (!(file instanceof File) || typeof mapping !== "string")
      throw Error("HR_FORM_INVALID");
    return Response.json(
      await runtime.preview(
        payrollActor,
        file,
        mappingSchema.parse(JSON.parse(mapping)),
      ),
      { headers: payrollHeaders },
    );
  } catch (e) {
    return payrollFailure(e);
  }
}

export function payrollRealDisabled() {
  return Response.json(
    {
      error: "HR_REAL_DISABLED",
      requirements: [
        "habilitation RH par organisation/dossier",
        "mappings validés",
        "stockage et exports RH autorisés",
        "revue de sécurité",
      ],
    },
    { status: 503, headers: payrollHeaders },
  );
}
