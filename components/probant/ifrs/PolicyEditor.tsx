"use client";
import { useMemo, useState } from "react";
import type { LeaseWork, LeaseWorkDraft } from "@/lib/workpapers/lease-work";
import s from "./ifrs.module.css";

type Election = "" | "elected" | "not_elected";
const KINDS = [{ kind: "short_term_exemption", label: "Exemption court terme (§ 8)" }, { kind: "non_lease_components_election", label: "Composantes non séparées (§ 15)" }] as const;
const draftOf = (work: LeaseWork | undefined): Record<string, Election> => Object.fromEntries((work?.policies ?? []).filter(p => p.answer.kind === "value").map(p => [p.kind + "|" + p.assetCategory, (p.answer as { value: Election }).value]));

/**
 * Politiques par catégorie d'actif : une élection se déclare explicitement (`élue` / `non élue`), jamais en texte libre ; « non déclarée »
 * reste un vide. L'enregistrement remplace le travail de la feuille (résultat, conclusion et revue effacés) et renvoie la version serveur.
 */
export function PolicyEditor({ categories, work, editable, busy, saveState, onSave }: { categories: string[]; work: LeaseWork | undefined; editable: boolean; busy: boolean;
  saveState: string; onSave(draft: LeaseWorkDraft): void }) {
  const saved = useMemo(() => draftOf(work), [work]);
  const [values, setValues] = useState<Record<string, Election>>(saved), [reason, setReason] = useState(work?.firstApplication.reason ?? "Entité déjà sous IFRS 16 ; aucune méthode de transition choisie par l'outil");
  // No work saved yet: the first save records the framework and the first application, which the qualification (and so the categories) needs.
  const dirty = !work || JSON.stringify(values) !== JSON.stringify(saved) || reason !== work.firstApplication.reason;
  const submit = () => onSave({
    framework: { standard: "IFRS 16", jurisdiction: "IASB", edition: "IFRS 16, IASB 2026", editionFingerprint: null }, firstApplication: { kind: "not_applicable", reason },
    policies: Object.entries(values).filter(([, v]) => v).map(([key, value]) => { const [kind, assetCategory] = key.split("|"); return { kind: kind as typeof KINDS[number]["kind"], assetCategory, answer: { kind: "value" as const, value } }; }),
    // Confirmations already cited are sent back unchanged: the server resolves their citations again.
    confirmations: (work?.confirmations ?? []).filter(c => c.citation.rowId).map(c => ({ contractId: c.contractId, field: c.field, answer: c.answer, citation: { documentVersionId: c.citation.documentVersionId, rowId: c.citation.rowId! } })),
  });
  return <section className={s.section} aria-labelledby="l16-policies-title">
    <div className={s.sectionHead}><h2 id="l16-policies-title">Politiques par catégorie d'actif</h2>
      <span role="status" aria-live="polite" className={s.saveState} data-state={dirty && saveState !== "saving" ? "dirty" : saveState}>{dirty && saveState !== "saving" ? "Modifications non enregistrées" : saveState === "saved" ? "Enregistré — version serveur reçue" : saveState === "conflict" ? "Conflit de version" : saveState === "saving" ? "Enregistrement…" : work ? "Travail enregistré" : "Aucun travail enregistré"}</span></div>
    {categories.length === 0 ? <p className={s.muted}>{work ? "Aucune catégorie : approuvez d'abord le registre des contrats." : "Enregistrez d'abord le cadre de la feuille (première application) : les contrats sont alors qualifiés et leurs catégories apparaissent ici."}</p> :
      <div className={s.scroll} role="region" aria-label="Politiques par catégorie — défilement au clavier" tabIndex={0}><table className={s.table} style={{ minWidth: 520 }}>
        <caption>« Non déclarée » n'est pas un refus : un contrat de 12 mois au plus reste à qualifier tant que la politique de sa catégorie manque.</caption>
        <thead><tr><th scope="col">Catégorie</th>{KINDS.map(k => <th key={k.kind} scope="col">{k.label}</th>)}</tr></thead>
        <tbody>{categories.map(category => <tr key={category}><th scope="row">{category}</th>{KINDS.map(k => { const key = k.kind + "|" + category;
          return <td key={k.kind}><select aria-label={k.label + " — " + category} value={values[key] ?? ""} disabled={!editable || busy} onChange={e => setValues(v => ({ ...v, [key]: e.target.value as Election }))}>
            <option value="">Non déclarée</option><option value="elected">Élue</option><option value="not_elected">Non élue</option></select></td>; })}</tr>)}</tbody>
      </table></div>}
    <div className={s.form}><label>Première application (aucune méthode de transition choisie par l'outil)<input value={reason} disabled={!editable || busy} onChange={e => setReason(e.target.value)}/></label></div>
    {editable && <p><button type="button" className={dirty ? s.primary : undefined} disabled={busy || !dirty || !reason.trim()} onClick={submit}>Enregistrer les politiques</button></p>}
  </section>;
}
