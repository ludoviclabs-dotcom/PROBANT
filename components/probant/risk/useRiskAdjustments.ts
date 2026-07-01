"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RiskAdjustment, RiskAdjustmentMap } from "@/lib/risk-mapping";
import {
  RISK_ADJUSTMENTS_KEY,
  emptyAdjustments,
  mergeAdjustment,
  parseAdjustments,
  serializeAdjustments,
  type AdjustmentPatch,
} from "@/lib/risk-mapping";

/**
 * Hook client de persistance des ajustements de risque.
 *
 * Source de vérité désormais : l'API `/api/adjustments` (store SIMULÉ en
 * mémoire côté serveur, voir `lib/server-store/adjustments-store.ts` — une
 * simple `Map` module-level, perdue au redémarrage du process Next.js, qui
 * imite la forme d'une vraie table sans être une persistance durable).
 *
 * Toute la logique de fusion/bornage (`clampAdjustment`/`mergeAdjustment`)
 * continue de déléguer aux fonctions PURES de `lib/risk-mapping/adjustments.ts`
 * pour la mise à jour optimiste locale ; ce hook orchestre en plus les appels
 * réseau (GET au montage, POST débouncé par axe modifié, DELETE/reset).
 *
 * Le `sessionStorage` est conservé comme CACHE OPTIMISTE de secours
 * best-effort (ne doit jamais faire planter le hook) : il permet un premier
 * rendu instantané avant la réponse serveur, mais n'est plus la source de
 * vérité — l'API prime toujours dès qu'elle répond.
 *
 * État initial `null` = sentinelle (pattern `CloisonsViewLive`) : on distingue
 * « pas encore hydraté » de « map vide », pour éviter tout écrasement du
 * storage/serveur par un premier rendu.
 */

/** États de sauvegarde exposés à l'UI (jamais bloquants). */
export type AdjustmentSaveStatus = "idle" | "saving" | "saved" | "error";

/** dossierId simulé unique (aucune vraie multi-tenance dans PROBANT). */
const DEMO_DOSSIER_ID = "demo-dossier";

/** Délai de debounce avant l'appel POST, en ms (un seul timer par cycle). */
const SAVE_DEBOUNCE_MS = 800;

/** Durée d'affichage de l'état "saved" avant retour à "idle". */
const SAVED_DISPLAY_MS = 1500;

type Axe = "probabilite" | "detectabilite";

/** Forme brute renvoyée par l'API (voir `JudgementAdjustmentRecord`). */
interface JudgementAdjustmentRecord {
  id: string;
  dossierId: string;
  cycleSlug: string;
  axe: Axe;
  valeurAjustee: number;
  commentaire?: string;
  updatedAt: string;
}

/** Ids serveur connus par cycle+axe, pour cibler les DELETE. */
type RecordIdMap = Record<string, { probabilite?: string; detectabilite?: string }>;

/** Reconstruit une `RiskAdjustmentMap` à partir des enregistrements plats de l'API. */
function buildAdjustmentsFromRecords(records: JudgementAdjustmentRecord[]): {
  adjustments: RiskAdjustmentMap;
  ids: RecordIdMap;
} {
  const adjustments: RiskAdjustmentMap = {};
  const ids: RecordIdMap = {};

  for (const record of records) {
    const current: RiskAdjustment = adjustments[record.cycleSlug] ?? {
      probabilite: 0,
      detectabilite: 0,
      touchedAt: record.updatedAt,
    };
    const next: RiskAdjustment = {
      ...current,
      [record.axe]: record.valeurAjustee,
      touchedAt: record.updatedAt > current.touchedAt ? record.updatedAt : current.touchedAt,
    };
    if (record.commentaire) {
      next.note = record.commentaire;
    }
    adjustments[record.cycleSlug] = next;

    const idsForCycle = ids[record.cycleSlug] ?? {};
    idsForCycle[record.axe] = record.id;
    ids[record.cycleSlug] = idsForCycle;
  }

  return { adjustments, ids };
}

/** Lecture best-effort du cache optimiste sessionStorage (jamais bloquant). */
function readSessionCache(): RiskAdjustmentMap {
  try {
    const raw = sessionStorage.getItem(RISK_ADJUSTMENTS_KEY);
    return parseAdjustments(raw);
  } catch {
    return emptyAdjustments();
  }
}

/** Écriture best-effort du cache optimiste sessionStorage (jamais bloquant). */
function writeSessionCache(next: RiskAdjustmentMap): void {
  try {
    sessionStorage.setItem(RISK_ADJUSTMENTS_KEY, serializeAdjustments(next));
  } catch {
    /* storage indisponible : l'état React / l'API restent la source de vérité */
  }
}

export function useRiskAdjustments(): {
  adjustments: RiskAdjustmentMap;
  setAdjustment: (slug: string, patch: AdjustmentPatch) => void;
  resetCycle: (slug: string) => void;
  resetAll: () => void;
  saveStatus: AdjustmentSaveStatus;
} {
  const [adjustments, setAdjustments] = useState<RiskAdjustmentMap | null>(null);
  const [saveStatus, setSaveStatus] = useState<AdjustmentSaveStatus>("idle");

  // Ids serveur connus par cycle/axe (alimentés par GET et POST), pour cibler
  // les DELETE lors d'un reset de cycle. Ref (et non state) : ne doit jamais
  // déclencher de re-render à lui seul.
  const recordIdsRef = useRef<RecordIdMap>({});
  // Un seul timer de debounce par cycleSlug.
  const debounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Timer d'affichage transitoire de l'état "saved".
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Compteur de requêtes POST en vol, pour ne repasser à "saved"/"idle"
  // qu'une fois toutes les requêtes concurrentes terminées.
  const pendingSavesRef = useRef(0);

  // Hydratation initiale : cache sessionStorage en secours immédiat, puis GET
  // API qui fait autorité dès qu'il répond (jamais bloquant, jamais fatal).
  useEffect(() => {
    setAdjustments(readSessionCache());

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/adjustments?dossierId=${encodeURIComponent(DEMO_DOSSIER_ID)}`,
        );
        if (!res.ok) return;
        const data: unknown = await res.json();
        const records =
          data && typeof data === "object" && Array.isArray((data as { adjustments?: unknown }).adjustments)
            ? ((data as { adjustments: JudgementAdjustmentRecord[] }).adjustments)
            : [];
        if (cancelled) return;
        const { adjustments: hydrated, ids } = buildAdjustmentsFromRecords(records);
        recordIdsRef.current = ids;
        setAdjustments(hydrated);
        writeSessionCache(hydrated);
      } catch {
        // API indisponible : on reste sur le cache sessionStorage déjà appliqué.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Nettoyage des timers en cours au démontage.
  useEffect(() => {
    return () => {
      for (const timer of debounceTimersRef.current.values()) {
        clearTimeout(timer);
      }
      debounceTimersRef.current.clear();
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  const markSaving = useCallback(() => {
    pendingSavesRef.current += 1;
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }
    setSaveStatus("saving");
  }, []);

  const markSaveSettled = useCallback((ok: boolean) => {
    pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1);
    if (!ok) {
      setSaveStatus("error");
      return;
    }
    if (pendingSavesRef.current > 0) {
      // D'autres requêtes sont encore en vol : on attend qu'elles se terminent.
      return;
    }
    setSaveStatus("saved");
    savedTimerRef.current = setTimeout(() => {
      setSaveStatus("idle");
      savedTimerRef.current = null;
    }, SAVED_DISPLAY_MS);
  }, []);

  /** Appelle POST /api/adjustments pour un axe donné, met à jour les ids connus. */
  const persistAxis = useCallback(
    async (slug: string, axe: Axe, valeurAjustee: number, commentaire: string | undefined) => {
      markSaving();
      try {
        const res = await fetch("/api/adjustments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dossierId: DEMO_DOSSIER_ID,
            cycleSlug: slug,
            axe,
            valeurAjustee,
            commentaire,
          }),
        });
        if (!res.ok) {
          markSaveSettled(false);
          return;
        }
        const record: unknown = await res.json();
        if (record && typeof record === "object" && typeof (record as { id?: unknown }).id === "string") {
          const idsForCycle = recordIdsRef.current[slug] ?? {};
          idsForCycle[axe] = (record as { id: string }).id;
          recordIdsRef.current[slug] = idsForCycle;
        }
        markSaveSettled(true);
      } catch {
        markSaveSettled(false);
      }
    },
    [markSaving, markSaveSettled],
  );

  /** Déclenche (ou relance) le debounce de sauvegarde pour un cycle. */
  const scheduleSave = useCallback(
    (slug: string, patch: AdjustmentPatch, adjustment: RiskAdjustment) => {
      const existing = debounceTimersRef.current.get(slug);
      if (existing) {
        clearTimeout(existing);
      }
      const timer = setTimeout(() => {
        debounceTimersRef.current.delete(slug);
        if (patch.probabilite !== undefined) {
          void persistAxis(slug, "probabilite", adjustment.probabilite, patch.note ?? adjustment.note);
        }
        if (patch.detectabilite !== undefined) {
          void persistAxis(slug, "detectabilite", adjustment.detectabilite, patch.note ?? adjustment.note);
        }
      }, SAVE_DEBOUNCE_MS);
      debounceTimersRef.current.set(slug, timer);
    },
    [persistAxis],
  );

  const setAdjustment = useCallback(
    (slug: string, patch: AdjustmentPatch) => {
      setAdjustments((prev) => {
        const base = prev ?? emptyAdjustments();
        const next = mergeAdjustment(base, slug, patch, new Date().toISOString());
        writeSessionCache(next);
        scheduleSave(slug, patch, next[slug]);
        return next;
      });
    },
    [scheduleSave],
  );

  const resetCycle = useCallback((slug: string) => {
    // Annule tout debounce en attente pour ce cycle : un reset prime sur une
    // sauvegarde différée qui n'a plus lieu d'être.
    const pending = debounceTimersRef.current.get(slug);
    if (pending) {
      clearTimeout(pending);
      debounceTimersRef.current.delete(slug);
    }

    setAdjustments((prev) => {
      const base = prev ?? emptyAdjustments();
      if (!(slug in base)) {
        return base;
      }
      const next: RiskAdjustmentMap = { ...base };
      delete next[slug];
      writeSessionCache(next);
      return next;
    });

    const ids = recordIdsRef.current[slug];
    if (ids) {
      delete recordIdsRef.current[slug];
      const toDelete = [ids.probabilite, ids.detectabilite].filter(
        (id): id is string => typeof id === "string",
      );
      for (const id of toDelete) {
        markSaving();
        fetch(`/api/adjustments/${encodeURIComponent(id)}`, { method: "DELETE" })
          .then((res) => markSaveSettled(res.ok))
          .catch(() => markSaveSettled(false));
      }
    }
  }, [markSaving, markSaveSettled]);

  const resetAll = useCallback(() => {
    // Annule tous les debounces en attente.
    for (const timer of debounceTimersRef.current.values()) {
      clearTimeout(timer);
    }
    debounceTimersRef.current.clear();
    recordIdsRef.current = {};

    const next = emptyAdjustments();
    writeSessionCache(next);
    setAdjustments(next);

    markSaving();
    fetch("/api/adjustments/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dossierId: DEMO_DOSSIER_ID }),
    })
      .then((res) => markSaveSettled(res.ok))
      .catch(() => markSaveSettled(false));
  }, [markSaving, markSaveSettled]);

  return {
    adjustments: adjustments ?? emptyAdjustments(),
    setAdjustment,
    resetCycle,
    resetAll,
    saveStatus,
  };
}
