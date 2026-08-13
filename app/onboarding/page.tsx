
"use client";

/**
 * Flow d'onboarding (Bloc 5.1) — stepper à 3 étapes qui réutilise le dépôt
 * FEC existant (`DepotView`) sans dupliquer sa logique de parsing/upload :
 *   1. Import FEC   → <DepotView /> tel quel.
 *   2. Paramétrage  → formulaire de forme (seuil ISA, exercice, société),
 *      purement démonstratif : sessionStorage uniquement, n'affecte AUCUN
 *      calcul réel du moteur.
 *   3. Génération   → CTA qui déclenche l'événement `mapping_generated` puis
 *      redirige vers la cartographie des risques déjà existante.
 *
 * La progression observe le `DossierSnapshot` actif, même source de vérité que
 * les pages métier du dashboard.
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, FileUp, Settings2, Sparkles } from "lucide-react";
import { DepotView } from "@/components/probant/DepotView";
import {
  ActiveDossierProvider,
  useActiveDossierSnapshot,
} from "@/lib/dossier/client";
import { track } from "@/lib/analytics/track";
import { cn } from "@/lib/utils";

const SEUIL_ISA_DEFAUT = 31700;
const EXERCICES = ["2022", "2023", "2024"] as const;

/** Année courante réelle, ramenée dans la plage d'exercices proposée. */
function exerciceParDefaut(): string {
  const annee = String(new Date().getFullYear());
  return (EXERCICES as readonly string[]).includes(annee)
    ? annee
    : EXERCICES[EXERCICES.length - 1];
}
const ONBOARDING_PARAMS_KEY = "probant:onboarding-params";

const STEPS = [
  { n: 1, label: "Import FEC", icon: FileUp },
  { n: 2, label: "Paramétrage", icon: Settings2 },
  { n: 3, label: "Génération", icon: Sparkles },
] as const;

function OnboardingContent() {
  const [step, setStep] = useState(1);
  const snapshot = useActiveDossierSnapshot();
  const fecPret =
    !snapshot.dossier.demoMode &&
    snapshot.sourceDocuments.some((document) => document.documentType === "fec");

  useEffect(() => {
    track("demo_viewed", { source: "onboarding" });
  }, []);

  function goToStep(n: number) {
    setStep(n);
    track("onboarding_step", { step: n });
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6">
        <h1 className="text-lg font-bold text-[var(--pb-text)]">
          Démarrer avec votre dossier
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--pb-text-muted)]">
          Importez votre FEC, paramétrez le dossier puis générez la
          cartographie des risques — en trois étapes.
        </p>
      </div>

      <Stepper current={step} />

      <div className="mt-6">
        {step === 1 && (
          <div className="space-y-4">
            <DepotView />
            <div className="flex items-center justify-between rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
              <p className="text-[12px] text-[var(--pb-text-muted)]">
                {fecPret ? (
                  <span className="flex items-center gap-1.5 text-[#22c55e]">
                    <CheckCircle2 className="h-4 w-4" /> FEC traité avec succès
                    dans cette session.
                  </span>
                ) : (
                  "Aucun FEC détecté pour l'instant dans cette session — vous pouvez tout de même continuer."
                )}
              </p>
              <button
                onClick={() => goToStep(2)}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--pb-accent)] px-4 py-2 text-[13px] font-semibold text-[#06122a] hover:opacity-90"
              >
                Suivant
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && <StepParametrage onNext={() => goToStep(3)} />}

        {step === 3 && <StepGeneration />}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <ActiveDossierProvider>
        <OnboardingContent />
      </ActiveDossierProvider>
    </Suspense>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((s, i) => {
        const active = s.n === current;
        const done = s.n < current;
        const Icon = s.icon;
        return (
          <div key={s.n} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] font-semibold transition-colors",
                active
                  ? "border-[var(--pb-accent)] bg-[var(--pb-accent)]/12 text-[var(--pb-text)]"
                  : done
                    ? "border-[var(--pb-border)] bg-[var(--pb-surface)] text-[var(--pb-accent)]"
                    : "border-[var(--pb-border)] bg-[var(--pb-surface)] text-[var(--pb-text-faint)]",
              )}
            >
              {done ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
              <span className="tnum">{s.n}.</span> {s.label}
            </div>
            {i < STEPS.length - 1 && (
              <div className="h-px flex-1 bg-[var(--pb-border)]" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepParametrage({ onNext }: { onNext: () => void }) {
  const [seuilIsa, setSeuilIsa] = useState(SEUIL_ISA_DEFAUT);
  const [exercice, setExercice] = useState(exerciceParDefaut());
  const [societe, setSociete] = useState("");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(ONBOARDING_PARAMS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p.seuilIsa === "number") setSeuilIsa(p.seuilIsa);
        if (typeof p.exercice === "string") setExercice(p.exercice);
        if (typeof p.societe === "string") setSociete(p.societe);
      }
    } catch {
      // sessionStorage indisponible : formulaire pré-rempli par défaut.
    }
  }, []);

  function persist(next: { seuilIsa: number; exercice: string; societe: string }) {
    try {
      sessionStorage.setItem(ONBOARDING_PARAMS_KEY, JSON.stringify(next));
    } catch {
      // Purement démonstratif : une session sans sessionStorage garde juste
      // les valeurs en mémoire locale du composant, sans casser le flow.
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-5">
        <h2 className="text-sm font-semibold text-[var(--pb-text)]">
          Paramétrage du dossier
        </h2>
        <p className="mt-1 text-[11px] text-[var(--pb-text-faint)]">
          Champs de forme, purement démonstratifs : ils n'affectent aucun
          calcul réel du moteur d'analyse.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wide text-[var(--pb-text-faint)]">
              Seuil ISA (signification, en €)
            </span>
            <input
              type="number"
              value={seuilIsa}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSeuilIsa(v);
                persist({ seuilIsa: v, exercice, societe });
              }}
              className="tnum mt-1.5 w-full rounded-lg border border-[var(--pb-border-strong)] bg-[var(--pb-surface-2)] px-3 py-2 text-sm text-[var(--pb-text)] outline-none focus:border-[var(--pb-accent)]"
            />
          </label>

          <label className="block">
            <span className="text-[11px] uppercase tracking-wide text-[var(--pb-text-faint)]">
              Exercice
            </span>
            <select
              value={exercice}
              onChange={(e) => {
                setExercice(e.target.value);
                persist({ seuilIsa, exercice: e.target.value, societe });
              }}
              className="mt-1.5 w-full rounded-lg border border-[var(--pb-border-strong)] bg-[var(--pb-surface-2)] px-3 py-2 text-sm text-[var(--pb-text)] outline-none focus:border-[var(--pb-accent)]"
            >
              {EXERCICES.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="text-[11px] uppercase tracking-wide text-[var(--pb-text-faint)]">
              Identité société (optionnel, texte libre — démonstratif)
            </span>
            <input
              type="text"
              placeholder="Ex : DEMO SA"
              value={societe}
              onChange={(e) => {
                setSociete(e.target.value);
                persist({ seuilIsa, exercice, societe: e.target.value });
              }}
              className="mt-1.5 w-full rounded-lg border border-[var(--pb-border-strong)] bg-[var(--pb-surface-2)] px-3 py-2 text-sm text-[var(--pb-text)] outline-none focus:border-[var(--pb-accent)]"
            />
          </label>
        </div>
      </div>

      <div className="flex items-center justify-end rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
        <button
          onClick={onNext}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--pb-accent)] px-4 py-2 text-[13px] font-semibold text-[#06122a] hover:opacity-90"
        >
          Suivant
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function StepGeneration() {
  const router = useRouter();

  function generer() {
    track("mapping_generated", { step: 3 });
    router.push("/dashboard/risques");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-6 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-[var(--pb-accent)]" />
        <h2 className="mt-3 text-sm font-semibold text-[var(--pb-text)]">
          Prêt à générer la cartographie des risques
        </h2>
        <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-[var(--pb-text-muted)]">
          Le moteur combine les constats du dépôt et le paramétrage renseigné
          pour construire la matrice et le graphe de flux de risques.
        </p>
        <button
          onClick={generer}
          className="mx-auto mt-4 flex items-center gap-2 rounded-lg bg-[var(--pb-accent)] px-5 py-2.5 text-[13.5px] font-semibold text-[#06122a] hover:opacity-90"
        >
          <Sparkles className="h-4 w-4" />
          Générer la cartographie
        </button>
      </div>
    </div>
  );
}
