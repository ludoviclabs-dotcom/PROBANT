"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Layers,
  Database,
  FileText,
  Download,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/normatif", label: "Vue d'ensemble", icon: BookOpen, exact: true },
  { href: "/normatif/cycles", label: "Cycles d'audit", icon: Layers },
  { href: "/normatif/sources", label: "Sources normatives", icon: Database },
  { href: "/normatif/methodologie", label: "Méthodologie", icon: FileText },
  { href: "/normatif/export", label: "Export", icon: Download },
];

export function CycleSidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-[var(--pb-border)] bg-[var(--pb-surface)]">
      <Link href="/normatif" className="flex items-center gap-2.5 px-5 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#a78bfa]/15 text-[#a78bfa]">
          <BookOpen className="h-5 w-5" />
        </span>
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-wide text-[var(--pb-text)]">
            Normatif 360
          </div>
          <div className="text-[10px] text-[var(--pb-text-faint)]">
            base de connaissance
          </div>
        </div>
      </Link>

      <nav className="flex-1 space-y-0.5 px-2 py-2">
        {NAV.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors",
                active
                  ? "bg-[#a78bfa]/12 font-semibold text-[var(--pb-text)]"
                  : "text-[var(--pb-text-muted)] hover:bg-[var(--pb-surface-2)] hover:text-[var(--pb-text)]",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  active ? "text-[#a78bfa]" : "text-[var(--pb-text-faint)]",
                )}
              />
              <span className="flex-1 truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <Link
        href="/dashboard/synthese"
        className="mx-2 mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-[var(--pb-text-muted)] transition-colors hover:bg-[var(--pb-surface-2)] hover:text-[var(--pb-text)]"
      >
        <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--pb-text-faint)]" />
        <span className="flex-1 truncate">Analyse FEC (PROBANT)</span>
      </Link>

      <div className="border-t border-[var(--pb-border)] px-4 py-3 text-[10px] leading-relaxed text-[var(--pb-text-faint)]">
        ISA · NEP · IFRS · PCG · LPF
        <br />
        Contenu en attente de validation experte.
      </div>
    </aside>
  );
}
