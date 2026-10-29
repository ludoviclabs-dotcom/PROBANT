"""Oracle indépendant des attendus IFRS 16 (lot C00) — à établir AVANT le moteur TypeScript.

Ce script n'importe aucun code PROBANT et ne doit jamais être remplacé par le moteur testé.
Il applique les conventions fixées dans docs/ifrs/CONTRAT_COMMUN.md (§ 5), qui sont des choix
techniques internes, pas des prescriptions IFRS :

- taux annuel effectif décimal r ; taux mensuel i = (1 + r)^(1/12) - 1 ; r/12 interdit ;
- loyers fixes mensuels à terme échu, commencement le 1er d'un mois, échéances en fin de mois ;
- dette exacte D_t = D_(t-1) × (1 + i) - L_t, précision 60 chiffres significatifs (le moteur
  travaille en virgule fixe à 40 décimales : l'oracle doit être plus précis que lui) ;
- publication au centime, moitié à l'opposé de zéro, des SOLDES ; intérêt publié de la période
  = dette publiée de clôture - dette publiée d'ouverture + loyers de la période ; écart avec
  l'intérêt économique arrondi tracé à part (borne : 1 centime par mois) ;
- droit d'utilisation initial = dette initiale publiée (autres composantes déclarées nulles) ;
  amortissement linéaire en mois entiers sur min(durée d'utilité retenue, durée du contrat) ;
  cumul publié après j mois = arrondi(ROU × j / m), dotation = différence de cumuls ;
- retraitement de clôture (bundle `closing_adjustment`) sur une base PCG qui a comptabilisé en
  charge les loyers échus de la période : aucun mouvement de trésorerie, effet d'ouverture
  = ROU net d'ouverture - dette d'ouverture, impôt non calculé (taxStatus = not_computed).

Lancement : python -I docs/ifrs/recette/attendus_l16.py   (écrit attendus_l16.json à côté)
"""
import json
import sys
from calendar import monthrange
from decimal import ROUND_HALF_UP, Decimal, getcontext
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
getcontext().prec = 60
CENT = Decimal("0.01")
EXACT = Decimal(1).scaleb(-40)


def eur(value: Decimal) -> Decimal:
    # « + 0 » ramène un résidu négatif infime (-0.00) au zéro 0.00.
    return value.quantize(CENT, rounding=ROUND_HALF_UP) + 0


def month_index(date: str) -> int:
    year, month = int(date[0:4]), int(date[5:7])
    return year * 12 + month - 1


def month_end(index: int) -> str:
    year, month = divmod(index, 12)
    return f"{year:04d}-{month + 1:02d}-{monthrange(year, month + 1)[1]:02d}"


def money(value: Decimal) -> str:
    return f"{value:.2f}"


FIXTURES = [
    {"id": "L16-F01", "label": "Référence du plan : trois loyers de 1 000,00 €, 1 % mensuel",
     "commencement": "2027-01-01", "months": 3, "payment": "1000.00", "rate": "0.126825030131969720661201",
     "closings": [["2027-01-01", "2027-01-31"], ["2027-01-01", "2027-03-31"]]},
    {"id": "L16-F02", "label": "Taux zéro documenté, 12 loyers de 500,00 €",
     "commencement": "2027-01-01", "months": 12, "payment": "500.00", "rate": "0", "closings": [["2027-01-01", "2027-12-31"]]},
    {"id": "L16-F03", "label": "Taux annuel effectif 5 %, 36 loyers de 1 000,00 €, trois clôtures annuelles",
     "commencement": "2027-01-01", "months": 36, "payment": "1000.00", "rate": "0.05",
     "closings": [["2027-01-01", "2027-12-31"], ["2028-01-01", "2028-12-31"], ["2029-01-01", "2029-12-31"]]},
    {"id": "L16-F04", "label": "Année bissextile : commencement 01/02/2028, première échéance 29/02/2028",
     "commencement": "2028-02-01", "months": 3, "payment": "1000.00", "rate": "0.126825030131969720661201",
     "closings": [["2028-02-01", "2028-02-29"]]},
    {"id": "L16-F05", "label": "Durée maximale technique : 120 loyers de 2 500,00 €, 4 %",
     "commencement": "2027-01-01", "months": 120, "payment": "2500.00", "rate": "0.04",
     "closings": [["2027-01-01", "2027-12-31"], ["2036-01-01", "2036-12-31"]]},
    {"id": "L16-F06", "label": "Terme final : un seul loyer de 10 000,00 €, 6 %",
     "commencement": "2027-12-01", "months": 1, "payment": "10000.00", "rate": "0.06", "closings": [["2027-01-01", "2027-12-31"]]},
    {"id": "L16-F07", "label": "Gros montant : 60 loyers de 12 345 678,91 €, 3,5 %",
     "commencement": "2027-01-01", "months": 60, "payment": "12345678.91", "rate": "0.035", "closings": [["2027-01-01", "2027-12-31"]]},
    {"id": "L16-F08", "label": "Contrat historique commencé le 01/01/2025, repris en 2027 avec ouverture cadrée",
     "commencement": "2025-01-01", "months": 60, "payment": "2000.00", "rate": "0.045",
     "closings": [["2025-01-01", "2025-12-31"], ["2026-01-01", "2026-12-31"], ["2027-01-01", "2027-12-31"]]},
    {"id": "L16-F09", "label": "Durée d'utilité retenue (24 mois) plus courte que le contrat (36 mois)",
     "commencement": "2027-01-01", "months": 36, "payment": "1000.00", "rate": "0.05", "usefulLifeMonths": 24,
     "closings": [["2027-01-01", "2027-12-31"], ["2028-01-01", "2028-12-31"], ["2029-01-01", "2029-12-31"]]},
    {"id": "L16-F10", "label": "Prise d'effet postérieure à la clôture : contrat à suivre, rien de reconnu",
     "commencement": "2028-01-01", "months": 12, "payment": "1000.00", "rate": "0.05", "closings": [["2027-01-01", "2027-12-31"]]},
]


def evaluate(fx: dict) -> dict:
    rate, payment, n = Decimal(fx["rate"]), Decimal(fx["payment"]), fx["months"]
    monthly = (1 + rate) ** (Decimal(1) / Decimal(12)) - 1
    exact = [sum(payment / (1 + monthly) ** t for t in range(1, n + 1))]
    # Seconde méthode, indépendante de la sommation : formule fermée de l'annuité à terme échu.
    closed_form = payment * n if monthly == 0 else payment * (1 - (1 + monthly) ** -n) / monthly
    assert abs(closed_form - exact[0]) < Decimal("1e-40"), (fx["id"], closed_form, exact[0])
    for _ in range(n):
        exact.append(exact[-1] * (1 + monthly) - payment)
    published = [eur(d) for d in exact]
    start = month_index(fx["commencement"])
    rou = published[0]
    dep_months = min(fx.get("usefulLifeMonths", n), n)

    def payments_made(date: str) -> int:
        return max(0, min(n, month_index(date) - start + 1))

    def accumulated(date: str) -> Decimal:
        elapsed = max(0, min(dep_months, month_index(date) - start + 1))
        return eur(rou * elapsed / dep_months)

    schedule = []
    for t in range(1, n + 1):
        interest_published = published[t] - published[t - 1] + payment
        interest_economic = eur(exact[t - 1] * monthly)
        schedule.append({"t": t, "dueDate": month_end(start + t - 1), "payment": money(payment),
                         "openingDebt": money(published[t - 1]), "interest": money(interest_published),
                         "principal": money(payment - interest_published), "closingDebt": money(published[t]),
                         "economicInterestRounded": money(interest_economic),
                         "roundingGap": money(interest_published - interest_economic)})

    closings = []
    for period_start, closing in fx["closings"]:
        if month_index(fx["commencement"]) > month_index(closing):
            closings.append({"periodStart": period_start, "closing": closing, "status": "not_commenced",
                             "reason": "Prise d'effet postérieure à la clôture : contrat à suivre, aucun montant reconnu à cette date"})
            continue
        opening_date = month_end(month_index(period_start) - 1)
        commenced_in_period = month_index(fx["commencement"]) >= month_index(period_start)
        k_open, k_close = payments_made(opening_date), payments_made(closing)
        rent = payment * (k_close - k_open)
        debt_open = Decimal(0) if commenced_in_period else published[k_open]
        debt_base = published[0] if commenced_in_period else published[k_open]
        debt_close = published[k_close]
        interest = debt_close - debt_base + rent
        acc_open = Decimal(0) if commenced_in_period else accumulated(opening_date)
        acc_close = accumulated(closing)
        depreciation = acc_close - acc_open
        rou_net_open = Decimal(0) if commenced_in_period else rou - acc_open
        rou_net_close = rou - acc_close
        opening_effect = rou_net_open - debt_open
        pnl = rent - interest - depreciation
        lines = [("rou_gross", rou, "debit"), ("rou_accumulated_depreciation", acc_close, "credit"),
                 ("lease_liability", debt_close, "credit"), ("lease_interest_expense", interest, "debit"),
                 ("rou_depreciation_expense", depreciation, "debit"), ("pcg_rent_neutralized", rent, "credit")]
        if opening_effect:
            lines.append(("opening_equity_effect", abs(opening_effect), "credit" if opening_effect > 0 else "debit"))
        lines = [(account, amount, side) for account, amount, side in lines if amount]
        debit = sum(a for _, a, s in lines if s == "debit")
        credit = sum(a for _, a, s in lines if s == "credit")
        assert debit == credit, (fx["id"], closing, debit, credit)
        assert opening_effect + pnl == rou_net_close - debt_close, (fx["id"], closing)
        closings.append({
            "periodStart": period_start, "closing": closing, "status": "computed",
            "paymentsInPeriod": k_close - k_open, "rentNeutralized": money(rent),
            "debtOpening": money(debt_open), "additions": money(published[0] if commenced_in_period else Decimal(0)),
            "interest": money(interest), "principal": money(rent - interest), "debtClosing": money(debt_close),
            "rouGross": money(rou), "accumulatedOpening": money(acc_open), "depreciation": money(depreciation),
            "accumulatedClosing": money(acc_close), "rouNetClosing": money(rou_net_close),
            "openingEquityEffect": money(opening_effect), "pnlEffectBeforeTax": money(pnl), "taxStatus": "not_computed",
            "resultContributions": {"lease_interest_expense": money(-interest), "rou_depreciation_expense": money(-depreciation),
                                    "pcg_rent_neutralized": money(rent)},
            "bundle": [{"account": account, "side": side, "amount": money(amount)} for account, amount, side in lines],
            "bundleTotal": money(debit),
        })

    total_interest = sum(Decimal(r["interest"]) for r in schedule)
    assert total_interest == payment * n - published[0], fx["id"]
    assert published[-1] == 0, fx["id"]
    assert all(abs(Decimal(r["roundingGap"])) <= CENT for r in schedule), fx["id"]
    mutated = eur(sum(payment / (1 + rate / 12) ** t for t in range(1, n + 1)))
    return {
        "id": fx["id"], "label": fx["label"], "inputs": {k: fx[k] for k in ("commencement", "months", "payment", "rate")} | {"usefulLifeMonths": fx.get("usefulLifeMonths", n)},
        "monthlyRateExact": format(monthly.quantize(EXACT), "f"), "debtInitialExact": format(exact[0].quantize(EXACT), "f"),
        "debtInitial": money(published[0]), "rouInitial": money(rou), "depreciationMonths": dep_months,
        "totalPayments": money(payment * n), "totalInterest": money(total_interest),
        "mutationRateDividedBy12": {"debtInitial": money(mutated), "detected": mutated != published[0]},
        "maxAbsRoundingGap": money(max(abs(Decimal(r["roundingGap"])) for r in schedule)),
        "schedule": schedule if n <= 36 else schedule[:3] + schedule[-3:], "scheduleTruncated": n > 36,
        "closings": closings,
    }


results = [evaluate(fx) for fx in FIXTURES]
output = Path(__file__).with_name("attendus_l16.json")
output.write_text(json.dumps({"oracle": "docs/ifrs/recette/attendus_l16.py", "precision": "Decimal, 60 chiffres significatifs",
                              "rounding": "ROUND_HALF_UP (moitié à l'opposé de zéro) au centime", "fixtures": results},
                             ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
for r in results:
    first = next((c for c in r["closings"] if c["status"] == "computed"), None)
    summary = f"dette initiale {r['debtInitial']}" if first else "non reconnu"
    if first:
        summary += f" ; {first['closing']} : dette {first['debtClosing']}, ROU net {first['rouNetClosing']}, résultat avant impôt {first['pnlEffectBeforeTax']}"
    print(f"{r['id']} {summary} ; r/12 → {r['mutationRateDividedBy12']['debtInitial']}")
print(f"{len(results)} fixtures, attendus écrits dans {output.name}")
