"use client";

import { useEffect, useMemo, useState } from "react";
import type { TaxIncidenceProvider } from "@/lib/synthesis/types";
import { corporateTaxIncidenceProvider } from "@/lib/tax/corporate-tax/scenario";
import type { CitIncidenceBase, CitIncidenceSheet } from "@/lib/workpapers/fiscal-incidence";
import { navigationContext } from "./navigation-context";
import type { DossierContext, DossierSnapshot } from "./types";

/**
 * Incidence fiscale des ajustements dans la Synthèse (C05 / C10). La base est lue côté serveur sur la feuille IS
 * verrouillée du même dossier et du même exercice ; le navigateur ne fait qu'exécuter le moteur IS sur cette entrée
 * (comme le cockpit fiscal), jamais un taux ou un calcul propre. Sans base, l'incidence reste inconnue, motif affiché.
 */
export type TaxIncidenceState =
  | { status: "loading" }
  | { status: "not_applicable"; reason: string }
  | { status: "unavailable"; reason: string; sheet: CitIncidenceSheet | null }
  | { status: "available"; sheet: CitIncidenceSheet; provider: TaxIncidenceProvider };

type Fetched = { key: string; result: Exclude<TaxIncidenceState, { status: "loading" | "available" }> | { status: "base"; base: Extract<CitIncidenceBase, { status: "available" }> } };

const FAILURES: Record<string, string> = {
  FX_DURABLE_DISABLED: "Feuilles fiscales non activées sur ce poste : incidence fiscale inconnue.",
  AUTHENTICATION_REQUIRED: "Session requise pour lire la feuille IS : incidence fiscale inconnue.",
  SESSION_INVALID: "Session expirée : incidence fiscale inconnue.",
  WORKPAPER_FORBIDDEN: "Droits insuffisants sur les feuilles fiscales du dossier : incidence fiscale inconnue.",
};

/** Clé de lecture : dossier persistant et exercice daté, sinon la raison pour laquelle aucune base n'est cherchée. */
function scopeOf(snapshot: DossierSnapshot, context: DossierContext): { key: string; dossierId: string; periodId: string } | { reason: string } {
  if (snapshot.sourceKind !== "persistent") return { reason: "Dossier de démonstration ou de session : aucune feuille IS rattachée, incidence fiscale inconnue hors taux qualifié." };
  const nav = navigationContext(snapshot, context);
  if (!nav.procedurePeriod) return { reason: "Exercice non daté : la feuille IS de l'exercice ne peut pas être retrouvée, incidence fiscale inconnue." };
  return { key: `${nav.dossierId}|${nav.procedurePeriod.id}`, dossierId: nav.dossierId, periodId: nav.procedurePeriod.id };
}

export function useTaxIncidence(snapshot: DossierSnapshot, context: DossierContext): TaxIncidenceState {
  const target = useMemo(() => scopeOf(snapshot, context), [snapshot, context]);
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const key = "key" in target ? target.key : null;

  useEffect(() => {
    if (!("key" in target)) return;
    let active = true;
    const query = new URLSearchParams({ dossierId: target.dossierId, periodId: target.periodId, operation: "incidence" });
    void fetch("/api/workpapers/fiscal?" + query, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as CitIncidenceBase & { error?: string };
        if (!response.ok) {
          const code = body.error ?? String(response.status);
          return { status: "unavailable" as const, reason: FAILURES[code] ?? `Lecture de la feuille IS impossible (${code}) : incidence fiscale inconnue.`, sheet: null };
        }
        return body.status === "available" ? { status: "base" as const, base: body } : { status: "unavailable" as const, reason: body.reason, sheet: body.sheet };
      })
      .catch(() => ({ status: "unavailable" as const, reason: "Feuille IS injoignable : incidence fiscale inconnue.", sheet: null }))
      .then((result) => { if (active) setFetched({ key: target.key, result }); });
    return () => { active = false; };
  }, [target]);

  return useMemo<TaxIncidenceState>(() => {
    if (!("key" in target)) return { status: "not_applicable", reason: target.reason };
    if (!fetched || fetched.key !== key) return { status: "loading" };
    const r = fetched.result;
    if (r.status !== "base") return r;
    return { status: "available", sheet: r.base.sheet, provider: corporateTaxIncidenceProvider(r.base.input) };
  }, [target, fetched, key]);
}
