import { z } from "zod";
import { CASH_GUIDE_EXAMPLES, CASH_EXAMPLE_WARNING } from "@/lib/workpapers/cash-examples";
import type { WorkpaperRun } from "@/lib/workpapers/model";
import type { CutoffResult } from "@/lib/workpapers/cutoff";
import type { searchUnrecordedLiabilities } from "@/lib/workpapers/payables";

const amountSchema = z.object({ amount: z.string().regex(/^-?\d+\.\d{2}$/), currency: z.literal("EUR") });
const bridgeSchema = z.object({ accountId: z.string(), closingDate: z.string(), bankBalance: amountSchema, referenceBookBalance: amountSchema,
  movement: amountSchema, reconstructed: amountSchema, difference: amountSchema, grossUnexplained: amountSchema,
  bookSourceDifference: amountSchema, bankSourceDifference: amountSchema, erbArithmeticDifference: amountSchema, differenceMeaning: z.string() });
/** Render server results only. No calculation, invented data or approval occurs in the UI. */
export function CycleTechnicalPanel({ run, cutoff = [], rpne, showExamples = false }: { run?: WorkpaperRun; cutoff?: CutoffResult[]; rpne?: ReturnType<typeof searchUnrecordedLiabilities>; showExamples?: boolean }) {
  const parsed = run?.result?.calculationKey === "cash.bridge.synthetic" ? bridgeSchema.safeParse(run.result.result) : null;
  const cash = parsed?.success ? parsed.data : null;
  return <section aria-label="Cadre technique Cash, cut-off et RPNE" className="my-4 space-y-3 rounded-xl border border-[var(--pb-border)] p-4">
    <h2 className="font-semibold">Cash · Cut-off · Fournisseurs / RPNE</h2>
    <p role="status">SOURCE REQUISE — PBC originaux et méthodes applicables absents. Guide pédagogique disponible, pas une norme. Règles métier et usage réel désactivés ; revue serveur et stockage durable non disponibles.</p>
    <button type="button" disabled className="rounded border px-3 py-2 disabled:opacity-60">Activer le cycle réel — indisponible</button>
    {parsed && !parsed.success && <p role="alert">Résultat Cash non disponible ou incompatible. Aucune conclusion affichée.</p>}
    {cash ? <>
      <h3>Pont bancaire — compte {cash.accountId}, clôture {cash.closingDate}</h3>
      <p>{cash.differenceMeaning}</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption>Table exacte du pont — EUR, aucune compensation des résidus</caption><thead><tr><th scope="col">Élément</th><th scope="col">EUR signé</th></tr></thead><tbody>
        {[["Solde relevé", cash.bankBalance], ["Éléments normalisés", cash.movement], ["Solde reconstruit", cash.reconstructed], ["Référence comptable", cash.referenceBookBalance], ["Écart référence moins pont", cash.difference], ["Brut inexpliqué", cash.grossUnexplained], ["ERB comptable moins balance", cash.bookSourceDifference], ["ERB bancaire moins relevé", cash.bankSourceDifference], ["Équilibre arithmétique de l’ERB", cash.erbArithmeticDifference]].map(([label, value]) => <tr key={label as string}><th scope="row">{label as string}</th><td>{(value as { amount: string }).amount}</td></tr>)}
      </tbody></table></div>
      <p>Apurement, confirmations, pouvoirs et engagements sont des procédures séparées. Accord arithmétique ≠ conclusion du cycle.</p>
    </> : !run && <p>Aucun résultat Cash actif. Le parcours de recette synthétique n’active aucune mission réelle.</p>}
    <h3>Cut-off partagé FAE / PCA / FNP / CCA</h3>
    {!cutoff.length ? <p>Facture seule insuffisante : fait générateur vérifié, recherche comptable et régularisations existantes requis. Méthode de prestation étalée non activée.</p> : cutoff.map((result) => <div key={result.id} className="overflow-x-auto">
      <p>{result.status} · {result.candidate ?? "Sans candidat"} · {result.amount.kind === "known" ? `${result.amount.value.amount} EUR` : result.amount.reason} · Revue humaine : {result.humanStatus}</p>
      <table className="w-full text-left text-sm"><caption>Frise documentaire de l’événement {result.economicEventId}</caption><thead><tr><th scope="col">Fait/document</th><th scope="col">Date</th><th scope="col">Information vérifiée</th></tr></thead><tbody>{result.timeline.map((point) => <tr key={point.label}><th scope="row">{point.label}</th><td>{point.date ?? "Inconnue"}</td><td>{point.verified ? "Oui, dans la fixture" : "Non"}</td></tr>)}</tbody></table>
      <p>{result.reasons.join(" ; ")}</p>
    </div>)}
    <h3>Recherche des passifs non enregistrés</h3>
    {!rpne ? <p>Population post-clôture et fenêtre documentée requises. Allocation des paiements, facture et preuve de livraison/prestation à rapprocher. Extrapolation désactivée.</p> : <>
      <p>Fenêtre {rpne.window.startDate} au {rpne.window.endDate} · Population {rpne.counts.population} · Sélection {rpne.counts.selected} · Testés {rpne.counts.tested} · Non testés {rpne.counts.notTested} · Non concluants {rpne.counts.inconclusive}</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption>Paiements sélectionnés ou non — sans inférence d’exhaustivité</caption><thead><tr><th scope="col">Paiement / source</th><th scope="col">Montant réglé EUR</th><th scope="col">Non alloué EUR</th><th scope="col">Statut</th></tr></thead><tbody>{rpne.rows.map((row) => <tr key={row.paymentId}><th scope="row">{row.paymentId} · {row.source.documentVersionId} / ligne {row.source.locator.row ?? "inconnue"}</th><td>{row.paidAmount.amount}</td><td>{row.unallocated.amount}</td><td>{row.status}</td></tr>)}</tbody></table></div>
      <p>Montant réglé distinct du montant potentiellement omis ; aucune TVA déduite du relevé.</p>
    </>}
    {showExamples && <details><summary className="cursor-pointer">Exemples pédagogiques du guide — PBC originales non disponibles</summary><p>{CASH_EXAMPLE_WARNING}</p><ul>{CASH_GUIDE_EXAMPLES.map((example) => <li key={example.bank}>{example.bank} : {example.observation} Source : {example.reference}.</li>)}</ul></details>}
  </section>;
}
