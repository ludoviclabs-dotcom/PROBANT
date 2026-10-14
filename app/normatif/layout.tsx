"use client";

import Link from "next/link";
import { ArrowLeft, Menu } from "lucide-react";
import { CycleSidebar } from "@/components/normatif/CycleSidebar";
import { useNavDrawer } from "@/components/probant/useNavDrawer";

export default function NormatifLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Tiroir de navigation (< md), même motif que app/dashboard/layout.tsx
  // (voir components/probant/useNavDrawer.ts).
  const { open: navOpen, close: closeNav, toggle: toggleNav, navRef, toggleRef } = useNavDrawer();

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--pb-bg)]">
      {navOpen && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[45] bg-black/60 md:hidden"
          onClick={closeNav}
        />
      )}
      <CycleSidebar
        ref={navRef}
        open={navOpen}
        onNavigate={closeNav}
        onClose={closeNav}
      />
      <div className="flex min-w-0 flex-1 flex-col" inert={navOpen}>
        {/* Sous sm, le titre (sans élément focalisable) passe sur sa propre ligne. */}
        <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--pb-border)] bg-[var(--pb-surface)] px-4 py-3 md:gap-x-4 md:px-6">
          <button
            ref={toggleRef}
            type="button"
            aria-label="Ouvrir la navigation"
            aria-controls="normatif-nav"
            aria-expanded={navOpen}
            onClick={toggleNav}
            className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--pb-border)] text-[var(--pb-text-muted)] hover:text-[var(--pb-text)] md:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
          <Link
            href="/"
            className="flex shrink-0 items-center gap-1.5 text-[12px] text-[var(--pb-text-faint)] transition-colors hover:text-[var(--pb-text)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Accueil
          </Link>
          <div className="h-4 w-px shrink-0 bg-[var(--pb-border)] max-sm:hidden" />
          <div className="min-w-0 max-sm:order-last max-sm:basis-full">
            <div className="text-sm font-semibold text-[var(--pb-text)]">
              Audit Normatif 360
            </div>
            <div className="text-[10px] text-[var(--pb-text-faint)]">
              Cartographie exhaustive des cycles d'audit financier
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="rounded-md border border-[#eab308]/30 bg-[#292207] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#eab308]">
              Contenu à valider
            </span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
