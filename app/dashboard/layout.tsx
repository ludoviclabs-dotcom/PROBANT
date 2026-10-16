"use client";

import { Suspense } from "react";
import { DashboardShell } from "@/components/instruments/DashboardShell";
import { DossierFailure, DossierLoading } from "@/components/instruments/DossierGate";
import { ActiveDossierProvider } from "@/lib/dossier/client";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ActiveDossierProvider loading={<DossierLoading />} failure={(message) => <DossierFailure message={message} />}>
        <DashboardShell>{children}</DashboardShell>
      </ActiveDossierProvider>
    </Suspense>
  );
}
