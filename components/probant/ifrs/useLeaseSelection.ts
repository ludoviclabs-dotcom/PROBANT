"use client";
import { useCallback, useEffect, useState } from "react";
import { parseSelection, selectionSearch, type LeaseFilter, type LeaseSelectionState } from "./selection-url";
import type { MatrixColumn } from "./format";
export type { LeaseSelectionState };

/**
 * État de sélection commun du poste (C02) : objet sélectionné, colonne examinée, filtre d'affichage, inspecteur ouvert.
 * Il vit dans l'URL : un lien direct rouvre la même vue, et le retour arrière referme l'inspecteur puis restaure le filtre précédent.
 * Il ne touche ni la population figée, ni la version revue, ni un export.
 */
export function useLeaseSelection(initial: LeaseSelectionState) {
  const [state, setState] = useState(initial);
  const write = useCallback((next: LeaseSelectionState, push: boolean) => {
    setState(next);
    if (typeof window === "undefined") return;
    const url = window.location.pathname + "?" + selectionSearch(window.location.search, next);
    if (push) window.history.pushState(null, "", url); else window.history.replaceState(null, "", url);
  }, []);
  useEffect(() => {
    const onPop = () => setState(parseSelection(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return {
    selection: state,
    open: (contractId: string, column: MatrixColumn | null) => write({ ...state, contractId, column }, state.contractId === null),
    close: () => write({ ...state, contractId: null, column: null }, false),
    filter: (filter: LeaseFilter) => write({ ...state, filter }, false),
  };
}
