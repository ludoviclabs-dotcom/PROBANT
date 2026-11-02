import { leaseServer } from "@/lib/workpapers/lease-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = leaseServer.exportPOST;
