"use client";

import type { ReactNode } from "react";
import { charteFonts } from "@/app/fonts";
import { ErrorState, LoadingState } from "@/components/synthese/states";
import s from "./shell.module.css";

/**
 * Rendus de repli du fournisseur de dossier, avant que le châssis ne soit monté : lecture en cours, dossier
 * indisponible. Ils portent leur propre ambiance (le châssis n'existe pas encore) et gardent les mots d'origine
 * (« Lecture du dossier sélectionné… », « Dossier indisponible ») pour que le message reste identifiable.
 */
function Gate({ children }: { children: ReactNode }) {
  return (
    <div data-ambiance="instruments" className={`${charteFonts} ${s.gate}`}>
      <main className={s.gateMain}>{children}</main>
    </div>
  );
}

export function DossierLoading() {
  return (
    <Gate>
      <LoadingState label="Résolution du dossier" title="Lecture du dossier sélectionné…" />
    </Gate>
  );
}

export function DossierFailure({ message }: { message: string }) {
  return (
    <Gate>
      <ErrorState
        eyebrow="Lecture interrompue"
        title="Dossier indisponible"
        facts={[
          ["Cause", message],
          ["Effet", "Aucun résultat n’est affiché tant que le dossier n’est pas résolu."],
        ]}
        actions={
          <a className={s.gateAction} href="/dashboard/dossier">
            Choisir un dossier disponible
          </a>
        }
      />
    </Gate>
  );
}
