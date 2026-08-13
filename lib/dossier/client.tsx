
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

interface ActiveDossierValue {
  context: DossierContext;
  snapshot: DossierSnapshot;
  saveSnapshot(snapshot: DossierSnapshot, context?: DossierContext): Promise<void>;
  selectDossier(context: DossierContext): Promise<void>;
  listSnapshots(organizationId?: string): Promise<DossierSnapshot[]>;
  resetToDemo(): Promise<void>;
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

  return (
    <ActiveDossierContext.Provider
      value={{
        context: state.context,
        snapshot: state.snapshot,
        saveSnapshot,
        selectDossier,
        listSnapshots,
        resetToDemo,
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

