import Link from "next/link";
import {
  ShieldCheck,
  Scale,
  Microscope,
  SlidersHorizontal,
  ArrowRight,
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

      <Link
        href="/dashboard/synthese"
        className="mt-10 inline-flex items-center gap-2 rounded-xl bg-[var(--pb-accent)] px-6 py-3 text-sm font-semibold text-[#06122a] transition-opacity hover:opacity-90"
      >
        Ouvrir la démo <ArrowRight className="h-4 w-4" />
      </Link>
      <p className="mt-3 text-[11px] text-[var(--pb-text-faint)]">
        Société fictive DEMO SA · données de démonstration
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
