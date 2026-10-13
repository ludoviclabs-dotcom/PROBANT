"use client";
import { useEffect, useState } from "react";
import { CAPABILITY_REGISTRY, MODE_LABELS } from "@/lib/capabilities/registry";
import { useActiveDossier } from "@/lib/dossier/client";
import { navigationContext, withDossierContext } from "@/lib/dossier/navigation-context";
import type { CapabilityReadModel } from "@/lib/capabilities/read-model";

export function CapabilityAccess() {
  const active = useActiveDossier(), c = navigationContext(active.snapshot, active.context);
  const [read, setRead] = useState<CapabilityReadModel | null>(null), [status, setStatus] = useState("Lecture des capacités…");
  const dossierId = c.dossierId, periodId = c.procedurePeriod?.id, mode = c.mode;
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    setRead(null); setStatus("Lecture des capacités…");
    const q = mode === "local_persistent" && periodId ? "?" + new URLSearchParams({ dossierId, periodId }) : "";
    void fetch("/api/dossier-capabilities" + q, { cache: "no-store", signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error(r.status === 401 ? "Session locale requise pour lire les feuilles." : r.status === 403 ? "Accès refusé à ce dossier." : "Lecture des feuilles indisponible ; travail non vérifié.");
      const value = await r.json(); if (current) { setRead(value); setStatus(value.observationStatus === "read" ? "Feuilles lues dans le dossier et la période sélectionnés." : "Travaux persistants non lus : dossier, période, activation et accès requis."); }
    }).catch(e => { if (current && !controller.signal.aborted) setStatus(e.message); });
    return () => { current = false; controller.abort(); };
  }, [dossierId, periodId, mode]);
  return <section aria-labelledby="capability-access-title" className="my-6">
    <h2 id="capability-access-title" className="text-lg font-semibold">Travaux par cycle</h2><p className="my-2 text-sm">{MODE_LABELS[c.mode]}. Capacité implémentée, configuration locale et travail exécuté sont distincts. {status}</p>
    <div className="divide-y divide-[var(--pb-border)]">{CAPABILITY_REGISTRY.map(cycle => {
      const observed = read?.observations.filter(o => cycle.procedures.some(p => p.id === o.procedure)) ?? [];
      const configuration = cycle.procedures.map(p => read?.configuration[p.id]);
      const configured = configuration.length > 0 && configuration.every(v => v?.activated && v.databaseConfigured);
      const observedCycle = cycle.procedures.length > 0 && cycle.procedures.every(p => read?.observedProcedures.includes(p.id));
      const route = cycle.synthesisRoute ?? cycle.routes[0];
      return <div key={cycle.id} className="py-3 text-sm [overflow-wrap:anywhere]">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold">{cycle.label}</h3>{route && <a className="underline" href={withDossierContext(route, c)}>Ouvrir {cycle.label}</a>}</div>
        <p>{cycle.modes[c.mode].scope}</p><p>Implémentation dans ce mode : {cycle.modes[c.mode].implemented ? "disponible sur le périmètre décrit" : "absente"} · Configuration locale : {read ? configured ? "activée, accès et connexion à contrôler" : "incomplète ou désactivée" : "non vérifiée"} · Travail : {observed.length ? observed.map(o => `${o.label}, v${o.version}, ${o.state} · résultat ${o.outcome ?? "non exécuté"}`).join(" ; ") : observedCycle ? "aucune feuille correspondante" : "non vérifié dans ce dossier"}</p>
        <details><summary>Sources, procédures et exclusions</summary><p>À fournir : {cycle.requiredSources.join(" ; ")}</p><p>Exclusions : {cycle.exclusions.join(" ; ")}</p><ul>{cycle.procedures.map(p => <li key={p.id}><a className="underline" href={withDossierContext(p.route, c)}>{p.label}</a></li>)}</ul><p>Atelier : {cycle.modes.scenario.scope}. Historique : {cycle.modes.historical.scope}.</p></details>
      </div>;
    })}</div>
  </section>;
}
