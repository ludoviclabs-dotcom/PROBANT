import { NextResponse } from "next/server";
import { loadAllCycles } from "@/lib/audit-cycles/loader";
import { buildSearchIndex, searchCycles, toSearchItem } from "@/lib/audit-cycles/search";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";

  const cycles = await loadAllCycles();
  const index = buildSearchIndex(cycles.map(toSearchItem));
  const results = searchCycles(q, index, 20);

  return NextResponse.json({ query: q, total: results.length, results });
}
