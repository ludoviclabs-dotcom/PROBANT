import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CycleSidebar } from "@/components/normatif/CycleSidebar";

export default function NormatifLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--pb-bg)]">
      <CycleSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-4 border-b border-[var(--pb-border)] bg-[var(--pb-surface)] px-6 py-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-[12px] text-[var(--pb-text-faint)] transition-colors hover:text-[var(--pb-text)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Accueil
          </Link>
          <div className="h-4 w-px bg-[var(--pb-border)]" />
          <div className="min-w-0">
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
