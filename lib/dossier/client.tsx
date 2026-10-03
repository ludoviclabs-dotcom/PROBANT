
"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
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
import { DossierUpdateQueue } from "./update-queue";
import { appendReviewDecisionToSnapshot } from "./snapshot-state";
import type { ReviewDecisionRequest } from "@/lib/evidence/types";

interface ActiveDossierValue {
  context: DossierContext;
  snapshot: DossierSnapshot;
  saveSnapshot(snapshot: DossierSnapshot, context?: DossierContext): Promise<void>;
  updateSnapshot(transform: (current: DossierSnapshot) => DossierSnapshot): Promise<DossierSnapshot>;
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
  const current = useRef(state);
  const queue = useRef(new DossierUpdateQueue());
  const publish = useCallback((next: typeof state) => {
    current.current = next;
    setState(next);
  }, []);
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
    void queue.current.run(async () => publish(await service.resolve(explicit)));
  }, [routeContext, routeKey, service, publish]);

  const saveSnapshot = useCallback(
    (snapshot: DossierSnapshot, explicitContext?: DossierContext) => queue.current.run(async () => {
      if (!service) throw new Error("Stockage de session indisponible.");
      const context = explicitContext ?? {
        organizationId: current.current.context.organizationId === "demo" ? "session" : current.current.context.organizationId,
        dossierId: snapshot.dossier.id,
      };
      await service.save(context, snapshot);
      publish({ context, snapshot });
    }), [service, publish],
  );

  const updateSnapshot = useCallback(
    (transform: (snapshot: DossierSnapshot) => DossierSnapshot) => queue.current.run(async () => {
      if (!service) throw new Error("Stockage de session indisponible.");
      const before = current.current;
      const snapshot = transform(before.snapshot);
      if (snapshot === before.snapshot) return snapshot;
      const context = { organizationId: before.snapshot.dossier.demoMode ? "session" : before.context.organizationId, dossierId: snapshot.dossier.id };
      await service.save(context, snapshot);
      publish({ context, snapshot });
      return snapshot;
    }), [service, publish],
  );

  const selectDossier = useCallback((context: DossierContext) => queue.current.run(async () => {
    if (!service) return;
    publish(await service.select(context));
  }), [service, publish]);

  const listSnapshots = useCallback(
    (organizationId = state.context.organizationId === "demo" ? "session" : state.context.organizationId) =>
      service?.list(organizationId) ?? Promise.resolve([]),
    [service, state.context.organizationId],
  );

  const resetToDemo = useCallback(() => selectDossier(DEMO_DOSSIER_CONTEXT), [selectDossier]);

  const appendReviewDecision = useCallback((input: ReviewDecisionRequest) => queue.current.run(async () => {
    const before = current.current;
    if (before.snapshot.sourceKind === "persistent") {
      const response = await fetchWithCsrf(`/api/dossiers/${encodeURIComponent(before.context.dossierId)}/review-events`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error(`REVIEW_EVENT_APPEND_FAILED:${response.status}`);
      publish({ context: before.context, snapshot: (await response.json()) as DossierSnapshot });
      return;
    }
    const next = appendReviewDecisionToSnapshot(before.snapshot, {
      id: crypto.randomUUID(), findingId: input.findingId,
      actorId: before.snapshot.sourceKind === "demo" ? "demo-reviewer" : "session-reviewer",
      actorRole: "reviewer", newStatus: input.newStatus, comment: input.comment,
      relatedEvidenceIds: input.relatedEvidenceIds, createdAt: new Date().toISOString(),
    });
    if (next.sourceKind !== "demo") {
      if (!service) throw new Error("Stockage de session indisponible.");
      await service.save(before.context, next);
    }
    publish({ context: before.context, snapshot: next });
  }), [service, publish]);

  return (
    <ActiveDossierContext.Provider
      value={{
        context: state.context,
        snapshot: state.snapshot,
        saveSnapshot,
        updateSnapshot,
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

