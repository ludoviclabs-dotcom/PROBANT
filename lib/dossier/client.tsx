
"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { fetchWithCsrf } from "@/lib/auth/csrf-client";
import type { DossierContext, DossierSnapshot } from "./types";
import {
  ActiveDossierService,
  DEMO_DOSSIER_CONTEXT,
  DemoDossierRepository,
  SessionDossierRepository,
  type SessionStoragePort,
} from "./repositories";
import { HttpDossierRepository } from "./http-repository";
import { buildDemoDossierSnapshot } from "./snapshot-builder";
import { appendReviewDecisionToSnapshot } from "./snapshot-state";
import type { ReviewDecisionRequest } from "@/lib/evidence/types";

interface ActiveDossierValue {
  context: DossierContext;
  snapshot: DossierSnapshot;
  saveSnapshot(snapshot: DossierSnapshot, context?: DossierContext): Promise<void>;
  selectDossier(context: DossierContext): Promise<void>;
  listSnapshots(organizationId?: string): Promise<DossierSnapshot[]>;
  resetToDemo(): Promise<void>;
  appendReviewDecision(input: ReviewDecisionRequest): Promise<void>;
}

const ActiveDossierContext = createContext<ActiveDossierValue | null>(null);

function routeContextFromParams(params: URLSearchParams): DossierContext | null {
  const scenario = params.get("scenario");
  if (scenario) {
    return { organizationId: "demo", dossierId: `demo-scenario-${scenario}` };
  }
  const dossierId = params.get("dossierId") ?? params.get("dossier");
  if (!dossierId) return null;
  return {
    organizationId: params.get("organizationId") ?? params.get("organization") ?? "session",
    dossierId,
  };
}

export function ActiveDossierProvider({
  children,
  storage,
  routeContext,
}: {
  children: ReactNode;
  storage?: SessionStoragePort;
  routeContext?: DossierContext | null;
}) {
  const searchParams = useSearchParams();
  const routeKey = searchParams.toString();
  const [state, setState] = useState(() => ({
    context: DEMO_DOSSIER_CONTEXT,
    snapshot: buildDemoDossierSnapshot(),
  }));
  const browserStorage = storage ?? (typeof window === "undefined" ? undefined : window.sessionStorage);
  const service = useMemo(
    () => browserStorage
      ? new ActiveDossierService(
          new DemoDossierRepository(),
          new SessionDossierRepository(browserStorage),
          new HttpDossierRepository(),
        )
      : null,
    [browserStorage],
  );

  useEffect(() => {
    if (!service) return;
    const explicit = routeContext === undefined
      ? routeContextFromParams(new URLSearchParams(routeKey))
      : routeContext;
    void service.resolve(explicit).then(setState);
  }, [routeContext, routeKey, service]);

  const saveSnapshot = useCallback(
    async (snapshot: DossierSnapshot, explicitContext?: DossierContext) => {
      if (!service) return;
      const context = explicitContext ?? {
        organizationId:
          state.context.organizationId === "demo" ? "session" : state.context.organizationId,
        dossierId: snapshot.dossier.id,
      };
      await service.save(context, snapshot);
      setState({ context, snapshot });
    },
    [service, state.context.organizationId],
  );

  const selectDossier = useCallback(async (context: DossierContext) => {
    if (!service) return;
    setState(await service.select(context));
  }, [service]);

  const listSnapshots = useCallback(
    (organizationId = state.context.organizationId === "demo" ? "session" : state.context.organizationId) =>
      service?.list(organizationId) ?? Promise.resolve([]),
    [service, state.context.organizationId],
  );

  const resetToDemo = useCallback(async () => {
    if (!service) return;
    setState(await service.select(DEMO_DOSSIER_CONTEXT));
  }, [service]);

  const appendReviewDecision = useCallback(async (input: ReviewDecisionRequest) => {
    if (state.snapshot.sourceKind === "persistent") {
      const response = await fetchWithCsrf(
        `/api/dossiers/${encodeURIComponent(state.context.dossierId)}/review-events`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      if (!response.ok) throw new Error(`REVIEW_EVENT_APPEND_FAILED:${response.status}`);
      const snapshot = (await response.json()) as DossierSnapshot;
      setState({ context: state.context, snapshot });
      return;
    }

    const next = appendReviewDecisionToSnapshot(state.snapshot, {
      id: crypto.randomUUID(),
      findingId: input.findingId,
      actorId: state.snapshot.sourceKind === "demo" ? "demo-reviewer" : "session-reviewer",
      actorRole: "reviewer",
      newStatus: input.newStatus,
      comment: input.comment,
      relatedEvidenceIds: input.relatedEvidenceIds,
      createdAt: new Date().toISOString(),
    });
    if (next.sourceKind === "demo") {
      setState({ context: state.context, snapshot: next });
      return;
    }
    if (!service) return;
    await service.save(state.context, next);
    setState({ context: state.context, snapshot: next });
  }, [service, state]);

  return (
    <ActiveDossierContext.Provider
      value={{
        context: state.context,
        snapshot: state.snapshot,
        saveSnapshot,
        selectDossier,
        listSnapshots,
        resetToDemo,
        appendReviewDecision,
      }}
    >
      {children}
    </ActiveDossierContext.Provider>
  );
}

export function useActiveDossier(): ActiveDossierValue {
  const value = useContext(ActiveDossierContext);
  if (!value) throw new Error("useActiveDossier doit etre utilise dans ActiveDossierProvider.");
  return value;
}

export function useActiveDossierSnapshot(): DossierSnapshot {
  return useActiveDossier().snapshot;
}

