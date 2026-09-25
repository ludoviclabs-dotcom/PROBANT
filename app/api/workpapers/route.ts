import { disabledWorkpaperEndpoint } from "@/lib/workpapers/http";
import { createDemoHttp } from "@/lib/workpapers/demo-http";
import { parseDemoFlags } from "@/lib/workpapers/operations";

// Fail closed. Do not bind a memory adapter to a public route or accept client identities.
export const GET = disabledWorkpaperEndpoint;
export const POST = disabledWorkpaperEndpoint;
// Separate, explicit synthetic teaching channel. GET/POST remain closed for real workpapers.
export const PUT = createDemoHttp(() => process.env.PROBANT_DEMONSTRATION_ENABLED === "true", () => Date.now(), () => parseDemoFlags(process.env.PROBANT_DEMONSTRATION_ENABLED, process.env.PROBANT_DEMO_DISABLED_CYCLES).disabledCycles, () => process.env.PROBANT_DEMONSTRATION_ORIGIN);
