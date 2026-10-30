"use client";
import type { QualifiedContract } from "@/lib/ifrs/leases/qualification";
import { dateFr, plural } from "./format";
import { useWidth } from "./LeaseCharts";
import s from "./ifrs.module.css";

/** Indice de mois pour placer un repère ; position seulement, aucun montant ni aucune échéance n'en est déduit. */
const month = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;

/**
 * Frise du contrat sélectionné (L16-04) : prise d'effet, échéances qualifiées, exercice examiné. Lecture seule : aucune échéance ne se déplace
 * depuis la frise, et aucune option de prolongation ou de résiliation n'est supposée ; la durée retenue est celle des sources qualifiées.
 */
export function ContractTimeline({ contract, period, paymentsInPeriod }: { contract: QualifiedContract; period: { startDate: string; closingDate: string }; paymentsInPeriod: number | null }) {
  const [ref, width] = useWidth(360);
  const dues = contract.dues.map(d => d.dueDate).sort();
  if (!contract.inputs || !dues.length) return <p className={s.muted}>Frise indisponible : termes ou échéancier du contrat incomplets (voir les motifs).</p>;
  const start = month(contract.inputs.commencement), last = month(dues.at(-1)!), p0 = month(period.startDate), p1 = month(period.closingDate);
  const from = Math.min(start, p0), to = Math.max(last, p1) + 1, pad = 8, H = 74;
  const x = (m: number) => pad + ((m - from) / (to - from)) * (width - 2 * pad);
  return <div ref={ref} className={s.chart}>
    <svg width={width} height={H} role="img" aria-label={"Frise : prise d'effet le " + dateFr(contract.inputs.commencement) + ", " + plural(dues.length, "échéance") + " jusqu'au " + dateFr(dues.at(-1)!) + ", exercice du " + dateFr(period.startDate) + " au " + dateFr(period.closingDate)}>
      <rect x={x(p0)} y={6} width={x(p1 + 1) - x(p0)} height={H - 30} className={s.timelinePeriod}/>
      <text x={x(p0) + 4} y={18} className={s.timelineText}>Exercice</text>
      <rect x={x(start)} y={30} width={Math.max(2, x(last + 1) - x(start))} height={8} className={s.timelineBar}/>
      {dues.map(d => <line key={d} x1={x(month(d) + 1)} x2={x(month(d) + 1)} y1={40} y2={46} className={s.timelineTick}/>)}
      <text x={x(start)} y={H - 6} className={s.timelineText}>{dateFr(contract.inputs.commencement)}</text>
      <text x={x(last + 1)} y={H - 6} textAnchor="end" className={s.timelineText}>{dateFr(dues.at(-1)!)}</text>
    </svg>
    <p className={s.muted}>Prise d'effet le {dateFr(contract.inputs.commencement)} · {plural(dues.length, "échéance qualifiée", "échéances qualifiées")}, dernière le {dateFr(dues.at(-1)!)}
      {paymentsInPeriod !== null ? " · " + plural(paymentsInPeriod, "échéance", "échéances") + " dans l'exercice (moteur)" : ""}. Options de prolongation ou de résiliation : aucune n'est modélisée en V1 ; la durée retenue vient des sources qualifiées (colonne Durée), et rien ne se déplace depuis cette frise.</p>
  </div>;
}
