import Link from "next/link";
import {
  ShieldCheck,
  Scale,
  Microscope,
  SlidersHorizontal,
  ArrowRight,
  BookMarked,
} from "lucide-react";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--pb-accent)]/15 text-[var(--pb-accent)]">
        <ShieldCheck className="h-7 w-7" />
      </span>
      <h1 className="mt-6 text-4xl font-bold tracking-tight text-[var(--pb-text)]">
        PROBANT
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--pb-text-muted)]">
        Orchestrateur de conformité analytique des états financiers français.
        Ingestion FEC, détection d'anomalies par cloison, dossier de preuve
        opposable — avec une séparation stricte entre droit dur, méthode d'audit
        et heuristiques internes.
      </p>

      <div className="mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
        <Pillar
          icon={Scale}
          color="#f87171"
          title="Socle normatif"
          text="LPF, PCG, ISA — versionnés et cités."
        />
        <Pillar
          icon={Microscope}
          color="#a78bfa"
          title="Moteur de constat"
          text="Calcule, compare, classe, documente."
        />
        <Pillar
          icon={SlidersHorizontal}
          color="#38bdf8"
          title="Restitution par cloison"
          text="Silos visuels, preuve et validation humaine."
        />
      </div>

      <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
        <Link
          href="/dashboard/synthese"
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--pb-accent)] px-6 py-3 text-sm font-semibold text-[#06122a] transition-opacity hover:opacity-90"
        >
          Ouvrir la démo d'analyse FEC <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/normatif"
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--pb-border-strong)] bg-[var(--pb-surface)] px-6 py-3 text-sm font-semibold text-[var(--pb-text)] transition-colors hover:bg-[var(--pb-surface-2)]"
        >
          <BookMarked className="h-4 w-4 text-[#a78bfa]" />
          Audit Normatif 360
        </Link>
      </div>
      <p className="mt-3 text-[11px] text-[var(--pb-text-faint)]">
        Démo : société fictive DEMO SA · Normatif 360 : 35 cycles d'audit (ISA,
        NEP, IFRS, PCG) — contenu à valider par un expert.
      </p>
    </div>
  );
}

function Pillar({
  icon: Icon,
  color,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4 text-left">
      <Icon className="h-5 w-5" style={{ color }} />
      <h3 className="mt-2 text-sm font-semibold text-[var(--pb-text)]">{title}</h3>
      <p className="mt-1 text-[12px] text-[var(--pb-text-muted)]">{text}</p>
    </div>
  );
}
