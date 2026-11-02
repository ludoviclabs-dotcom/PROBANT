import { StateNotice } from "./Primitives";

/** Consignations de `rule-review.ts` refusées par le garde (servies par le serveur) : elles comptent comme absentes, et l'écran dit pourquoi. */
export function ReviewRefusals({ refusals }: { refusals: readonly string[] }) {
  if (!refusals.length) return null;
  return <StateNotice tone="danger" role="alert" title="Consignation de relecture refusée">
    <ul>{refusals.map(r => <li key={r}>{r}</li>)}</ul>Corrigez le bloc dans lib/ifrs/leases/rule-review.ts avec votre nom et l'heure réelle de la relecture, en UTC ; d'ici là, elle compte comme absente.</StateNotice>;
}
