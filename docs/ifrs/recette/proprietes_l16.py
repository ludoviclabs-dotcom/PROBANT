"""Attendus aléatoires indépendants (lot L16-06) — contrats tirés par graine, calculés par l'oracle C00.

Ce script n'importe aucun code PROBANT. Il charge la fonction `evaluate` de attendus_l16.py (même dossier, même
conventions, précision Decimal à 60 chiffres) et l'applique à 200 contrats tirés par `random.Random(16006)` :
durées de 1 à 120 mois, commencements de 2024 à 2027, taux nuls, courts ou longs, loyers de 0,01 € à 50 000,00 €
et quelques montants de plusieurs millions, durées d'utilité plus courtes ou plus longues que le contrat ; chaque
contrat reçoit une clôture annuelle tirée parmi : avant le commencement, exercice du commencement, exercice
ultérieur, exercice après la fin. Le critère de précision interne est fixé avant le calcul (RECETTE_REFERENCE § 3) :
écart ≤ 10⁻²⁰ sur le taux mensuel et la dette initiale exacts ; les montants publiés se comparent au centime.

Lancement : python -I docs/ifrs/recette/proprietes_l16.py   (écrit attendus_proprietes_l16.json à côté)
"""
import importlib.util
import json
import random
import sys
from decimal import Decimal
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.dont_write_bytecode = True
here = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("attendus_l16", here / "attendus_l16.py")
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)

SEED, COUNT = 16006, 200
rng = random.Random(SEED)


def draw_rate() -> str:
    kind = rng.random()
    if kind < 0.1:
        return "0"
    if kind < 0.2:
        # Long decimal rates, up to 24 digits, as a documented effective rate may carry.
        return format(Decimal(rng.randint(1, 10**24 - 1)) / Decimal(10**24) * Decimal("0.3"), "f")[:26]
    return format(Decimal(rng.randint(1, 250_000)) / Decimal(1_000_000), "f")


def draw_payment() -> str:
    if rng.random() < 0.05:
        return f"{Decimal(rng.randint(100_000_000, 1_500_000_000)) / 100:.2f}"
    return f"{Decimal(rng.randint(1, 5_000_000)) / 100:.2f}"


cases = []
for n in range(1, COUNT + 1):
    months = rng.choice([1, 2, 3, 12, 13, 24, 36, 60, 119, 120]) if rng.random() < 0.3 else rng.randint(1, 120)
    year, month = rng.randint(2024, 2027), rng.randint(1, 12)
    commencement = f"{year:04d}-{month:02d}-01"
    useful = months
    draw = rng.random()
    if draw < 0.25:
        useful = rng.randint(1, months)
    elif draw < 0.35:
        useful = months + rng.randint(1, 60)
    last = oracle.month_index(commencement) + months - 1
    end_year = last // 12
    closing_year = rng.choice([year - 1, year, year + 1, end_year, end_year + 1])
    fx = {"id": f"P{n:03d}", "label": "Contrat tiré par graine", "commencement": commencement, "months": months, "payment": draw_payment(),
          "rate": draw_rate(), "usefulLifeMonths": useful, "closings": [[f"{closing_year:04d}-01-01", f"{closing_year:04d}-12-31"]]}
    r = oracle.evaluate(fx)
    # The full published schedule, independent of the truncation of attendus_l16.json: closing debt after each due.
    rate, payment = Decimal(fx["rate"]), Decimal(fx["payment"])
    monthly = (1 + rate) ** (Decimal(1) / Decimal(12)) - 1
    exact = [sum(payment / (1 + monthly) ** t for t in range(1, months + 1))]
    for _ in range(months):
        exact.append(exact[-1] * (1 + monthly) - payment)
    published = [oracle.eur(d) for d in exact]
    assert oracle.money(published[0]) == r["debtInitial"], fx["id"]
    full = [oracle.money(published[t]) for t in range(1, months + 1)]
    cases.append({"id": fx["id"], "inputs": r["inputs"], "monthlyRateExact": r["monthlyRateExact"], "debtInitialExact": r["debtInitialExact"],
                  "debtInitial": r["debtInitial"], "depreciationMonths": r["depreciationMonths"], "totalInterest": r["totalInterest"],
                  "closingDebts": full, "closing": r["closings"][0]})

output = here / "attendus_proprietes_l16.json"
output.write_text(json.dumps({"oracle": "docs/ifrs/recette/proprietes_l16.py (fonction evaluate de attendus_l16.py)", "seed": SEED, "count": COUNT,
                              "precision": "Decimal, 60 chiffres significatifs ; critère interne ≤ 1e-20 fixé avant calcul",
                              "cases": cases}, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8", newline="\n")
by_status = {}
for c in cases:
    by_status[c["closing"]["status"]] = by_status.get(c["closing"]["status"], 0) + 1
print(f"{len(cases)} contrats tirés (graine {SEED}) ; clôtures : {by_status} ; écrit {output.name}")
