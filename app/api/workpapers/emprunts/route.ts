import { loanServer } from "@/lib/workpapers/loan-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = loanServer.GET;
export const POST = loanServer.POST;
