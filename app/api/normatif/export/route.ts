import { NextResponse } from "next/server";
import { loadAllCycles, loadCycle } from "@/lib/audit-cycles/loader";
import {
  exportToJSON,
  exportToCSV,
  exportToMarkdown,
  exportAllToMarkdown,
} from "@/lib/audit-cycles/export";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") ?? "json";
  const slug = searchParams.get("slug");

  // Export d'une fiche unique en Markdown.
  if (slug) {
    try {
      const cycle = await loadCycle(slug);
      return new NextResponse(exportToMarkdown(cycle), {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${slug}.md"`,
        },
      });
    } catch {
      return NextResponse.json({ error: `Cycle introuvable : ${slug}` }, { status: 404 });
    }
  }

  const cycles = await loadAllCycles();

  if (format === "csv") {
    return new NextResponse("﻿" + exportToCSV(cycles), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-normatif-360.csv"`,
      },
    });
  }

  if (format === "md") {
    return new NextResponse(exportAllToMarkdown(cycles), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-normatif-360.md"`,
      },
    });
  }

  return new NextResponse(exportToJSON(cycles), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-normatif-360.json"`,
    },
  });
}
