import { leaseServer } from "@/lib/workpapers/lease-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = leaseServer.GET;
export const POST = leaseServer.POST;
