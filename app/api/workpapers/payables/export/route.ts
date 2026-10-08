import { payablesServer } from "@/lib/workpapers/payables-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const POST=payablesServer.exportPOST;
