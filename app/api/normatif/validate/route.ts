import { NextResponse } from "next/server";
import { validateAll } from "@/lib/audit-cycles/validation";

export const runtime = "nodejs";

export async function GET() {
  const result = await validateAll();
  return NextResponse.json(result, { status: result.valid ? 200 : 422 });
}
