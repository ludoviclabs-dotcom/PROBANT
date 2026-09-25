import { disabledWorkpaperEndpoint } from "@/lib/workpapers/http";

// Fail closed. Do not bind a memory adapter to a public route or accept client identities.
export const GET = disabledWorkpaperEndpoint;
export const POST = disabledWorkpaperEndpoint;
// The browser-only synthetic workshop has no serverless session endpoint.
export const PUT = disabledWorkpaperEndpoint;
