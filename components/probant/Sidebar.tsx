"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Upload,
  LayoutDashboard,
  Columns3,
  FileCheck2,
  FlaskConical,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DemoLauncher } from "@/components/probant/DemoLauncher";

const NAV = [
  { href: "/dashboard/depot", label: "Dépôt & ingestion", icon: Upload },
  { href: "/dashboard/synthese", label: "Synthèse", icon: LayoutDashboard },
  { href: "/dashboard/cloisons", label: "Revue par cloison", icon: Columns3 },
  { href: "/dashboard/dossier", label: "Dossier & preuve", icon: FileCheck2 },
  { href: "/dashboard/tests", label: "Tests complémentaires", icon: FlaskConical },
  { href: "/dashboard/referentiel", label: "Seuils & référentiel", icon: Scale },
];

export function Sidebar({
  badges,
}: {
  badges?: Partial<Record<string, number>>;
}) {
  const pathname = usePathname();
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-[var(--pb-border)] bg-[var(--pb-surface)]">
      <Link
        href="/dashboard/synthese"
        className="flex items-center gap-2.5 px-5 py-4"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--pb-accent)]/15 text-[var(--pb-accent)]">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-wide text-[var(--pb-text)]">
            PROBANT
          </div>
          <div className="text-[10px] text-[var(--pb-text-faint)]">
            revue analytique
          </div>
        </div>
      </Link>

      <nav className="flex-1 space-y-0.5 px-2 py-2">
        {NAV.map((item) => {
          const active = pathname === item.href;
          const badge = badges?.[item.href];
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors",
                active
                  ? "bg-[var(--pb-accent)]/12 font-semibold text-[var(--pb-text)]"
                  : "text-[var(--pb-text-muted)] hover:bg-[var(--pb-surface-2)] hover:text-[var(--pb-text)]",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  active ? "text-[var(--pb-accent)]" : "text-[var(--pb-text-faint)]",
                )}
              />
              <span className="flex-1 truncate">{item.label}</span>
              {badge ? (
                <span className="tnum rounded-md bg-[#2a1416] px-1.5 py-0.5 text-[10px] font-semibold text-[#ef4444]">
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-2 pt-1">
        <DemoLauncher variant="sidebar" />
      </div>

      <div className="border-t border-[var(--pb-border)] px-4 py-3 text-[10px] leading-relaxed text-[var(--pb-text-faint)]">
        Socle normatif · moteur de constat · restitution.
        <br />
        Séparation droit dur / méthode / interne.
      </div>
    </aside>
  );
}
