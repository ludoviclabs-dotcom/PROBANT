"use client";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { capabilitiesForRoute, MODE_LABELS } from "@/lib/capabilities/registry";
import { navigationContext, parseNavigationContext, switchDossierContext, withDossierContext, type DossierNavigationContext } from "@/lib/dossier/navigation-context";
import { SessionDossierRepository } from "@/lib/dossier/repositories";

export function DossierRouteBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname(), params = useSearchParams(), router = useRouter();
  const key = params.toString();
  let context: DossierNavigationContext | null = null, error = "";
  try { context = parseNavigationContext(new URLSearchParams(key)); } catch (e) { error = e instanceof Error ? e.message : "Contexte invalide."; }
  const [choices, setChoices] = useState<DossierNavigationContext[]>([]);
  const organizationId = context?.organizationId;
  useEffect(() => {
    if (!organizationId) return;
    let active = true;
    void new SessionDossierRepository(window.sessionStorage).list(organizationId).then(snapshots => {
      if (active) setChoices(snapshots.map(s => navigationContext(s, { organizationId, dossierId: s.dossier.id })));
    }).catch(() => { if (active) setChoices([]); });
    return () => { active = false; };
  }, [organizationId, key]);
  const capabilities = capabilitiesForRoute(pathname);
  if (!capabilities.length || pathname.startsWith("/dashboard")) return children;
  if (error) return <main className="mx-auto max-w-5xl p-6"><h1>Contexte à vérifier</h1><p role="alert">{error}</p><a className="underline" href="/dashboard/dossier">Choisir le dossier et son exercice</a></main>;
  if (!context) return children; // Legacy exact-version links remain accepted by their existing server contracts.
  const c = context, scoped = (href: string) => withDossierContext(href, c);
  const availableChoices = choices.filter(v => v.organizationId === c.organizationId);
  const workshop = c.mode !== "local_persistent";
  return <>
    <section aria-label="Contexte du dossier" className="mx-auto flex max-w-6xl flex-wrap gap-3 border-b border-[var(--pb-border)] p-4 text-sm [overflow-wrap:anywhere]">
      <div className="min-w-0 flex-1"><strong>{c.entity.label}</strong> · exercice {c.exercise.label}<p>{MODE_LABELS[c.mode]} · référentiel {c.reference}</p>
        <p>{c.procedurePeriod ? `${c.procedurePeriod.kind === "exercise" ? "Exercice" : c.procedurePeriod.kind === "vat" ? "Période TVA" : "Période paie"} : ${c.procedurePeriod.startDate} → ${c.procedurePeriod.endDate}` : "Période de procédure à confirmer ; aucun résultat supposé."}</p>
        <details><summary>Identité et méthode du contexte</summary><p>Dossier {c.dossierId} · organisation {c.organizationId}</p><p>Exercice : {c.exercise.startDate ?? "début inconnu"} → {c.exercise.closingDate ?? "clôture inconnue"}. Les repères du lien ne remplacent ni les sources ni l’autorisation serveur.</p></details>
      </div>
      {availableChoices.length > 0 && <label>Dossier et exercice<select className="block max-w-full rounded border border-[var(--pb-border)] bg-[var(--pb-surface)] p-2" value={c.dossierId} onChange={e => { const next = availableChoices.find(v => v.dossierId === e.target.value); if (next) router.push(switchDossierContext(pathname, next)); }}><option value={c.dossierId}>{c.entity.label} · {c.exercise.label}</option>{availableChoices.filter(v => v.dossierId !== c.dossierId).map(v => <option key={v.dossierId} value={v.dossierId}>{v.entity.label} · {v.exercise.label}</option>)}</select></label>}
      <nav aria-label="Retour au dossier" className="flex flex-wrap gap-3"><a className="underline" href={scoped("/dashboard/synthese")}>Retour à la Synthèse</a><a className="underline" href={scoped("/dashboard/dossier")}>Dossier et preuves</a><a className="underline" href={scoped("/dashboard/tests")}>Atelier · simulation</a></nav>
    </section>
    {workshop ? <main className="mx-auto max-w-6xl space-y-4 p-6"><h1>{capabilities[0].label}</h1><p>Aucune feuille persistante n’est rattachée à ces constats {c.mode === "scenario" ? "de simulation" : "historiques"}. Aucun résultat de mission n’a été créé.</p>
      <p>{capabilities.map(v => v.modes.local_persistent.scope).join(" ; ")}</p>
      <h2 className="text-lg font-semibold">Préparer une feuille pour ce dossier</h2><p>Qualifiez un dossier local et ses dates d’exercice, puis initialisez explicitement sa feuille. Les comptes de DEMO SA ne sont pas copiés.</p>
      <a className="inline-block rounded border border-[var(--pb-border)] p-3 underline" href={scoped("/dashboard/depot")}>Initialiser ce dossier à partir de ses pièces locales</a>
      <h2 className="text-lg font-semibold">Sources à fournir</h2><ul className="list-inside list-disc">{[...new Set(capabilities.flatMap(v => v.requiredSources))].map(s => <li key={s}>{s}</li>)}</ul>
      <p>Exclusions : {capabilities.flatMap(v => v.exclusions).join(" ; ")}</p>
      <a className="underline" href={scoped("/dashboard/tests#cycle-demo-title")}>Ouvrir l’atelier de simulation distinct</a>
    </main> : <div key={pathname + "?" + key}>{children}</div>}
  </>;
}
