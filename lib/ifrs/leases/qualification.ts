import { cents, money, type Money } from "@/lib/canonical-model/money";
import { dependencyFingerprint } from "@/lib/ifrs/shared/fingerprint";
import { LEASE_DICTIONARY, NOT_APPLICABLE_TOKEN, UNKNOWN_TOKEN, type FieldSpec, type LeaseDocumentType } from "./dictionary";

/**
 * Qualification du portefeuille de locations (L16-01), fonction pure : mêmes faits, même travail, même résultat.
 * La qualification humaine ne se déduit jamais d'un nom de bailleur, d'un compte ni d'un montant ; aucun contrat incomplet ne devient
 * calculable par valeur par défaut. Les statuts de contrat restent distincts des états de la feuille (SCOPE_V1 § 1).
 */
export type ContractStatus = "non_location" | "exemption_documentee" | "eligible_v1" | "a_qualifier" | "hors_scope_v1";
export const CONTRACT_STATUSES: readonly ContractStatus[] = ["non_location", "exemption_documentee", "eligible_v1", "a_qualifier", "hors_scope_v1"];
export interface SourceProof { importId: string; documentVersionId: string; rowId: string; fileName: string; sha256: string; row?: number }
export interface SourceFact {
  key: string; contractId?: string; amount: Money; date: string; fields: Record<string, string>;
  source: { title: string; pack: string; date: string; page: number | null; clause: string }; proof: SourceProof;
}
export type LeaseFacts = Record<LeaseDocumentType, SourceFact[]>;
export interface QualificationReason { code: string; effect: "hors_scope_v1" | "a_qualifier" | "non_location" | "exemption" | "info"; field?: string; message: string }
export interface LeasePolicy { kind: "short_term_exemption" | "non_lease_components_election" | "vat_treatment"; assetCategory: string; answer: Answer }
export interface LeaseConfirmation { contractId: string; field: string; answer: Answer }
type Answer = { kind: "value"; value: string } | { kind: "unknown"; reason: string } | { kind: "not_applicable"; reason: string };
export interface QualificationWork { policies: readonly LeasePolicy[]; confirmations: readonly LeaseConfirmation[] }
export type DueRole = "exigible" | "non_encore_exigible";
export type Settlement = "regle" | "inconnu" | "insuffisant" | "excedentaire" | "non_applicable";
export interface QualifiedDue { key: string; dueDate: string; amount: Money; role: DueRole; settlement: Settlement; paidAmount?: Money; paidVat?: Money; paidOn?: string; proof: SourceProof }
/** Entrées du calcul, posées seulement pour un contrat `eligible_v1` : chaque valeur vient d'une source ou d'une confirmation citée. */
export interface LeaseEngineInputs {
  contractId: string; version: string; commencement: string; months: number; payment: Money; annualRate: string; usefulLifeMonths: number;
  opening: null | { date: string; debt: string; rouGross: string; rouAccumulated: string; rouNet: string; reportingRef: string; reviewEvidence: string } | "absent" | "incomplete";
}
export interface QualifiedContract {
  contractId: string; version: string | null; assetCategory: string | null; lessor: string | null; status: ContractStatus; reasons: QualificationReason[];
  historical: boolean; notCommenced: boolean; dues: QualifiedDue[]; inputs: LeaseEngineInputs | null; evidence: SourceProof[]; fingerprint: string;
}
export interface LeaseQualification {
  contracts: QualifiedContract[]; orphans: { type: LeaseDocumentType; key: string; contractId: string | null; message: string; proof: SourceProof }[];
  coverage: {
    /** Registre de contrats fourni : nombre par statut. Aucune exhaustivité de tous les contrats de l'entité n'en découle. */
    registry: { contracts: number; byStatus: Record<ContractStatus, number> };
    /** Population comptable fournie : lignes rattachées à un contrat du registre ou non, en sommes absolues. */
    ledger: { lines: number; matched: number; unmatched: number; absMatched: Money; absUnmatched: Money; unknownContracts: string[] };
  };
}

const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
export function monthEnd(index: number) {
  const year = Math.floor(index / 12), month = index % 12, last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}
const spec = (type: LeaseDocumentType, key: string): FieldSpec => (LEASE_DICTIONARY[type] as readonly FieldSpec[]).find(s => s.key === key)!;
type Read = { state: "empty" | "unknown" | "na" | "value"; value?: string };

export function qualifyLeases(facts: LeaseFacts, period: { startDate: string; closingDate: string; asOfDate: string }, work: QualificationWork, rule: { id: string; version: string; basisStatus: "review_required" | "validated" }): LeaseQualification {
  const registry = new Set(facts.lease_contracts.map(c => c.key));
  const contracts = facts.lease_contracts.map(contract => qualifyOne(contract, facts, period, work));
  const fingerprints = dependencyFingerprint({
    sources: Object.entries(facts).filter(([, rows]) => rows.length).map(([type, rows]) => ({ documentType: type, importId: rows[0].proof.importId, documentVersionId: rows[0].proof.documentVersionId, byteHash: rows[0].proof.sha256, mappingVersion: "ifrs16-leases-2" })),
    policy: work.policies, rule,
    contracts: Object.fromEntries(contracts.map(c => [c.contractId, { contract: facts.lease_contracts.find(x => x.key === c.contractId)!.fields, ...ownFacts(facts, c.contractId), confirmations: work.confirmations.filter(x => x.contractId === c.contractId) }])),
  });
  for (const c of contracts) c.fingerprint = fingerprints.contracts[c.contractId];
  const orphans: LeaseQualification["orphans"] = [];
  for (const type of ["lease_assumptions", "lease_schedule", "lease_opening"] as const)
    for (const row of facts[type]) if (!row.contractId || !registry.has(row.contractId)) orphans.push({ type, key: row.key, contractId: row.contractId ?? null, message: "Ligne sans contrat du registre : conservée, jamais appariée ni compensée", proof: row.proof });
  const ledger = facts.lease_ledger, matched = ledger.filter(l => l.contractId && registry.has(l.contractId)), unmatched = ledger.filter(l => !l.contractId || !registry.has(l.contractId));
  const abs = (rows: SourceFact[]) => money(rows.reduce((t, r) => { const v = cents(r.amount); return t + (v < 0n ? -v : v); }, 0n));
  const byStatus = Object.fromEntries(CONTRACT_STATUSES.map(s => [s, contracts.filter(c => c.status === s).length])) as Record<ContractStatus, number>;
  return { contracts, orphans, coverage: { registry: { contracts: contracts.length, byStatus },
    ledger: { lines: ledger.length, matched: matched.length, unmatched: unmatched.length, absMatched: abs(matched), absUnmatched: abs(unmatched),
      unknownContracts: [...new Set(unmatched.flatMap(l => l.contractId ? [l.contractId] : []))].sort() } } };
}
const ownFacts = (facts: LeaseFacts, id: string) => ({
  assumptions: facts.lease_assumptions.filter(x => x.contractId === id).map(x => x.fields),
  schedule: facts.lease_schedule.filter(x => x.contractId === id).map(x => ({ date: x.date, amount: x.amount, fields: x.fields })),
  opening: facts.lease_opening.filter(x => x.contractId === id).map(x => x.fields),
});

function qualifyOne(contract: SourceFact, facts: LeaseFacts, period: { startDate: string; closingDate: string; asOfDate: string }, work: QualificationWork): QualifiedContract {
  const id = contract.key, reasons: QualificationReason[] = [], evidence: SourceProof[] = [contract.proof];
  const assumptions = facts.lease_assumptions.find(a => a.contractId === id) ?? null;
  if (assumptions) evidence.push(assumptions.proof);
  const confirmations = work.confirmations.filter(c => c.contractId === id);
  // A confirmation cited by the preparer completes or corrects the source; it never invents a value the field does not admit.
  const read = (type: "lease_contracts" | "lease_assumptions", key: string): Read => {
    const confirmed = confirmations.find(c => c.field === key)?.answer;
    const raw = confirmed ? (confirmed.kind === "value" ? confirmed.value : confirmed.kind === "unknown" ? UNKNOWN_TOKEN : NOT_APPLICABLE_TOKEN)
      : (type === "lease_contracts" ? contract.fields[key] : assumptions?.fields[key]);
    if (raw === undefined) return { state: "empty" };
    if (raw === UNKNOWN_TOKEN) return { state: "unknown" };
    if (raw === NOT_APPLICABLE_TOKEN) return { state: "na" };
    return { state: "value", value: raw };
  };
  const add = (code: string, effect: QualificationReason["effect"], message: string, field?: string) => reasons.push({ code, effect, message, ...(field ? { field } : {}) });
  /** Required value: empty, unknown or a non-admitted not-applicable makes the contract to qualify. */
  const need = (type: "lease_contracts" | "lease_assumptions", key: string, code = "X25"): string | null => {
    const r = read(type, key), s = spec(type, key);
    if (r.state === "value") return r.value!;
    if (r.state === "na" && s.naAllowed) return null;
    add(r.state === "empty" ? code : r.state === "unknown" ? code : "Q07", "a_qualifier",
      r.state === "empty" ? s.label + " : champ vide, qui ne prouve pas l'absence" : r.state === "unknown" ? s.label + " : réponse « inconnu »" : s.label + " : « non applicable » non admis pour ce champ", key);
    return null;
  };
  const value = (type: "lease_contracts" | "lease_assumptions", key: string) => { const r = read(type, key); return r.state === "value" ? r.value! : null; };
  const base = { contractId: id, version: value("lease_contracts", "contractVersion"), assetCategory: value("lease_contracts", "assetCategory"), lessor: value("lease_contracts", "lessor"),
    historical: false, notCommenced: false, dues: [] as QualifiedDue[], inputs: null, evidence, fingerprint: "" };
  const done = (status: ContractStatus): QualifiedContract => ({ ...base, status, reasons });

  // 1. Identification (§ 9-11, B9-B31): never inferred from a lessor, an account or an amount.
  const identified = need("lease_contracts", "identifiedAsset", "R01"), control = need("lease_contracts", "controlOfUse", "R01"), proof = need("lease_contracts", "identificationEvidence", "R01");
  if ((identified === "no" || control === "no") && proof) { add("R01", "non_location", "Qualification documentée : le contrat ne contient pas de location (§ 9-11)"); return done("non_location"); }
  if (!identified || !control || !proof) return done("a_qualifier");
  if (!assumptions) { add("X25", "a_qualifier", "Aucune ligne d'hypothèses pour ce contrat"); return done("a_qualifier"); }
  // 2. Scope of the tool (entity role, currency).
  const role = need("lease_contracts", "role");
  if (role && role !== "lessee") add("X30", "hors_scope_v1", "Rôle « " + role + " » : seul le preneur est couvert");
  const currency = need("lease_contracts", "contractCurrency");
  if (currency && currency !== "EUR") add("X16", "hors_scope_v1", "Devise " + currency + " : seul l'euro est couvert");
  if (reasons.some(r => r.effect === "hors_scope_v1")) return done("hors_scope_v1");
  // 3. Exemptions (§ 5-8, annexe A, B3-B8): a documented policy and judgement, never an amount threshold.
  const months = need("lease_contracts", "termMonths", "X20"), category = need("lease_contracts", "assetCategory");
  const lowValue = need("lease_assumptions", "lowValueExemption");
  if (lowValue === "elected") {
    const newValue = value("lease_assumptions", "lowValueNewValue"), judgement = value("lease_assumptions", "lowValueJudgement");
    if (newValue && judgement) { add("R03", "exemption", "Exemption faible valeur documentée : valeur à neuf et jugement B3-B8 cités"); return done("exemption_documentee"); }
    add("X23", "a_qualifier", "Exemption faible valeur sans valeur à neuf ni jugement B3-B8 : non justifiée"); return done("a_qualifier");
  }
  const term = months !== null ? Number(months) : null;
  if (term !== null && term <= 12 && category) {
    const policy = work.policies.find(p => p.kind === "short_term_exemption" && p.assetCategory === category);
    if (!policy || policy.answer.kind !== "value") add("Q08", "a_qualifier", "Contrat de 12 mois au plus : politique court terme de la catégorie « " + category + " » non déclarée (§ 8)");
    else if (policy.answer.value === "elected") {
      const option = need("lease_assumptions", "purchaseOption"), judgement = need("lease_assumptions", "termJudgement", "X20");
      if (option === "present") { add("X22", "a_qualifier", "Option d'achat : le contrat n'est pas de courte durée (annexe A), exemption refusée"); return done("a_qualifier"); }
      if (option === "none" && judgement) { add("R03", "exemption", "Exemption court terme : politique de la catégorie « " + category + " », durée de " + term + " mois et sans option d'achat"); return done("exemption_documentee"); }
      return done("a_qualifier");
    }
  }
  // 4. Recognised lease: every required answer, then the V1 closed perimeter.
  for (const type of ["lease_contracts", "lease_assumptions"] as const)
    for (const s of LEASE_DICTIONARY[type] as readonly FieldSpec[]) if (s.required && !reasons.some(r => r.field === s.key)) need(type, s.key, s.key === "termMonths" || s.key === "termJudgement" ? "X20" : ["rateKind", "annualEffectiveRate", "rateDate", "rateJustification", "rateBasis"].includes(s.key) ? "X19" : "X25");
  const v = (type: "lease_contracts" | "lease_assumptions", key: string) => value(type, key);
  const hors = (code: string, message: string) => add(code, "hors_scope_v1", message);
  if (v("lease_contracts", "versionNature") === "economic_modification" || v("lease_assumptions", "modification") === "present") hors("X12", "Modification ou réestimation : hors V1 ; une nouvelle version documentaire ne réécrit pas l'historique");
  if (v("lease_contracts", "paymentFrequency") && v("lease_contracts", "paymentFrequency") !== "monthly") hors("X17", "Loyers non mensuels : hors convention V1");
  if (v("lease_contracts", "paymentTiming") === "advance") hors("X03", "Loyers à échoir : hors V1");
  const vat = v("lease_contracts", "vatTreatment");
  if (vat === "non_recoverable" || vat === "uncertain") hors("X21", "TVA non récupérable ou récupération incertaine : hors calcul V1, sans décision fiscale implicite");
  if (v("lease_contracts", "depreciationMethod") === "other") hors("Q05", "Amortissement non linéaire : hors V1");
  const variable = v("lease_assumptions", "variablePayments");
  if (variable === "index") hors("X01", "Loyers indexés ou liés à un taux : hors V1");
  if (variable === "usage") hors("X02", "Loyers variables non indexés : hors V1");
  for (const [key, code, label] of [["prepaidPayments", "X03", "Paiement d'avance"], ["leaseIncentives", "X04", "Avantage incitatif reçu"], ["initialDirectCosts", "X05", "Coûts directs initiaux"], ["restorationCosts", "X06", "Coûts de remise en état"]] as const) {
    const amount = v("lease_assumptions", key);
    if (amount !== null && cents({ amount, currency: "EUR" }) !== 0n) hors(code, label + " ≠ 0 : hors V1 (droit d'utilisation initial ≠ dette)");
  }
  for (const [key, code, label] of [["residualValueGuarantee", "X09", "Garantie de valeur résiduelle"], ["purchaseOption", "X10", "Option d'achat"], ["ownershipTransfer", "X10", "Transfert de propriété"],
    ["terminationPenalty", "X11", "Pénalité de résiliation incluse dans la durée"], ["impairmentIndicator", "X14", "Indice de dépréciation (IAS 36)"], ["capitalizedInOtherAsset", "X15", "Charge incorporée au coût d'un autre actif"]] as const)
    if (v("lease_assumptions", key) === "present") hors(code, label + " : hors V1");
  if (term !== null && (term < 1 || term > 120)) hors("X18", "Durée de " + term + " mois hors de la borne technique 1-120 (limite interne, non normative)");
  const rate = v("lease_assumptions", "annualEffectiveRate");
  if (rate !== null && (rate.startsWith("-") || !/^(0|1)(\.\d+)?$/.test(rate) || (rate.startsWith("1") && /[1-9]/.test(rate.slice(1))))) hors("X19", "Taux négatif ou supérieur à 100 % : hors V1");
  const commencement = contract.date;
  if (!commencement.endsWith("-01")) hors("X17", "Commencement le " + commencement + " : le 1er du mois est requis (convention V1)");
  // 5. Answers that make the contract to qualify.
  const qualify = (code: string, message: string, field?: string) => add(code, "a_qualifier", message, field);
  const basis = v("lease_assumptions", "rateBasis");
  if (basis && basis !== "annual_effective") qualify("X19", "Taux " + basis + " : à convertir en taux annuel effectif par l'utilisateur, en citant la source et la méthode ; jamais converti en silence", "rateBasis");
  const services = v("lease_contracts", "serviceComponents");
  if (services === "present") qualify("X07", "Services non séparés sans élection § 15 documentée : composante locative à isoler", "serviceComponents");
  if (services === "election_15" && !work.policies.some(p => p.kind === "non_lease_components_election" && p.assetCategory === category && p.answer.kind === "value" && p.answer.value === "elected"))
    qualify("X07", "Élection § 15 déclarée sans politique de la catégorie « " + category + " »", "serviceComponents");
  if (v("lease_assumptions", "deposit") === "unqualified") qualify("X08", "Dépôt de garantie à qualifier", "deposit");
  const signature = v("lease_contracts", "signatureDate");
  if (signature && signature > commencement) qualify("Q01", "Signature postérieure au commencement", "signatureDate");
  const payment = v("lease_contracts", "payment"), end = v("lease_contracts", "endDate");
  if (term !== null && term >= 1 && end && end !== monthEnd(monthIndex(commencement) + term - 1)) qualify("Q02", "Fin du contrat " + end + " incohérente avec " + term + " mois depuis le " + commencement, "endDate");
  if (term !== null && payment && cents(contract.amount) !== cents({ amount: payment, currency: "EUR" }) * BigInt(term)) qualify("Q03", "Total des loyers de la pièce (" + contract.amount.amount + ") ≠ loyer × durée", "payment");
  const life = v("lease_contracts", "usefulLifeMonths");
  if (life !== null && Number(life) < 1) qualify("Q04", "Durée d'utilité inférieure à un mois", "usefulLifeMonths");
  // 6. Dues and settlements: a due already payable at the review date needs a settlement proof; a future due is not missing.
  const version = base.version, dues = facts.lease_schedule.filter(d => d.contractId === id).sort((a, b) => (a.date < b.date ? -1 : 1));
  base.dues = dues.map(d => {
    evidence.push(d.proof);
    const role: DueRole = d.date <= period.asOfDate ? "exigible" : "non_encore_exigible";
    const paid = d.fields.paidAmount, vatPaid = d.fields.paidVat, paidDate = d.fields.paidDate;
    let settlement: Settlement = "non_applicable";
    if (role === "exigible") {
      if (!paid || !paidDate || [paid, paidDate].some(x => x === UNKNOWN_TOKEN || x === NOT_APPLICABLE_TOKEN)) settlement = "inconnu";
      else {
        const net = cents({ amount: paid, currency: "EUR" }) - (vatPaid && /^-?\d/.test(vatPaid) ? cents({ amount: vatPaid, currency: "EUR" }) : 0n), due = cents(d.amount);
        settlement = net === due ? "regle" : net < due ? "insuffisant" : "excedentaire";
      }
    }
    return { key: d.key, dueDate: d.date, amount: d.amount, role, settlement, ...(paid && /^-?\d/.test(paid) ? { paidAmount: { amount: paid, currency: "EUR" as const } } : {}),
      ...(vatPaid && /^-?\d/.test(vatPaid) ? { paidVat: { amount: vatPaid, currency: "EUR" as const } } : {}), ...(paidDate && /^\d{4}-\d{2}-\d{2}$/.test(paidDate) ? { paidOn: paidDate } : {}), proof: d.proof };
  });
  if (term !== null && term >= 1 && term <= 120 && commencement.endsWith("-01")) {
    const start = monthIndex(commencement), expected = Array.from({ length: term }, (_, t) => monthEnd(start + t));
    if (dues.length !== term || dues.some((d, t) => d.date !== expected[t])) {
      if (dues.some(d => !expected.includes(d.date) && d.date.slice(8) !== monthEnd(monthIndex(d.date)).slice(8))) hors("X17", "Échéance hors fin de mois : hors convention V1");
      else qualify("Q10", "Échéancier incomplet ou décalé : " + dues.length + " échéances pour " + term + " mois", "schedule");
    }
  }
  if (payment && dues.some(d => cents(d.amount) !== cents({ amount: payment, currency: "EUR" }))) hors("X01", "Montants d'échéance non constants : loyers variables hors V1");
  if (version && dues.some(d => d.fields.contractVersion !== version)) qualify("Q09", "Échéance rattachée à une autre version du contrat", "schedule");
  for (const d of base.dues) {
    if (d.settlement === "insuffisant") hors("X13", "Échéance du " + d.dueDate + " réglée partiellement : échéancier non respecté");
    if (d.settlement === "inconnu") qualify("X13", "Échéance du " + d.dueDate + " exigible à la date de revue : preuve de règlement absente (inconnu)", "schedule");
    if (d.settlement === "excedentaire") qualify("Q06", "Échéance du " + d.dueDate + " : règlement supérieur au loyer dû (paiement réel discordant)", "schedule");
  }
  base.historical = commencement < period.startDate;
  base.notCommenced = monthIndex(commencement) > monthIndex(period.closingDate);
  if (base.notCommenced) add("X34", "info", "Prise d'effet postérieure à la clôture : contrat à suivre, rien de reconnu à cette date");
  if (reasons.some(r => r.effect === "hors_scope_v1")) return done("hors_scope_v1");
  if (reasons.some(r => r.effect === "a_qualifier")) return done("a_qualifier");
  // 7. Historical takeover: recomputed from the origin; the external opening is compared, never used to balance (D14).
  let opening: LeaseEngineInputs["opening"] = null;
  if (base.historical) {
    const row = facts.lease_opening.find(o => o.contractId === id);
    if (!row) { opening = "absent"; add("X24", "info", "Contrat historique sans ouverture validée : calcul affiché en diagnostic, aucun retraitement déterminé"); }
    else {
      evidence.push(row.proof);
      const g = (k: string) => { const x = row.fields[k]; return x && x !== UNKNOWN_TOKEN && x !== NOT_APPLICABLE_TOKEN ? x : null; };
      const fields = ["openingDate", "debt", "rouGross", "rouAccumulated", "rouNet", "reportingRef", "reviewEvidence"].map(g);
      if (fields.some(x => x === null)) { opening = "incomplete"; add("X24", "info", "Ouverture historique incomplète : diagnostic"); }
      else { const [date, debt, rouGross, rouAccumulated, rouNet, reportingRef, reviewEvidence] = fields as string[]; opening = { date, debt, rouGross, rouAccumulated, rouNet, reportingRef, reviewEvidence }; }
    }
  }
  return { ...base, status: "eligible_v1", reasons, inputs: { contractId: id, version: version!, commencement, months: term!, payment: { amount: payment!, currency: "EUR" }, annualRate: rate!, usefulLifeMonths: Number(life), opening } };
}
