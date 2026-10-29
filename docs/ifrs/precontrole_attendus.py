"""Précontrôle des chiffres de recette cités par le plan IFRS 16 / IFRS 18 (docs/ifrs/plan/).

Recalcul indépendant, sans aucun code PROBANT, des attendus écrits dans L16-02, L16-03, P18-02,
P18-03 et P18-04. Ce script ne remplace pas l'oracle que C00 doit établir
(docs/ifrs/RECETTE_REFERENCE.md) : il vérifie seulement que les chiffres du plan sont cohérents.

Conventions (celles proposées par L16-02, non normatives) : décimal à 40 chiffres significatifs,
taux mensuel (1 + r)^(1/12) - 1 pour un taux annuel effectif r, arrondi au centime moitié à
l'opposé de zéro (ROUND_HALF_UP de Python), mouvements publiés dérivés des soldes arrondis.

Lancement : python -I docs/ifrs/precontrole_attendus.py
"""
import sys
from decimal import ROUND_HALF_UP, Decimal, getcontext

sys.stdout.reconfigure(encoding="utf-8")  # sortie lisible sous Windows, y compris redirigée
getcontext().prec = 40
CENT = Decimal("0.01")


def eur(value: Decimal) -> Decimal:
    # « + 0 » ramène un résidu négatif infime (-0.00) au zéro affiché 0.00.
    return value.quantize(CENT, rounding=ROUND_HALF_UP) + 0


def lease_schedule(annual_effective_rate: Decimal, payments: list[Decimal]):
    """Dette au commencement et soldes exacts après chaque paiement à terme échu."""
    monthly = (1 + annual_effective_rate) ** (Decimal(1) / Decimal(12)) - 1
    opening = sum(p / (1 + monthly) ** t for t, p in enumerate(payments, start=1))
    balances = [opening]
    for payment in payments:
        balances.append(balances[-1] * (1 + monthly) - payment)
    return monthly, balances


def check(label: str, actual, expected) -> bool:
    ok = actual == expected
    print(f"{'OK ' if ok else 'KO '} {label} : {actual} (plan : {expected})")
    return ok


results: list[bool] = []

# L16-02 : trois loyers de 1 000,00 € à terme échu, taux annuel effectif équivalent à 1 % mensuel.
rate = Decimal("0.126825030131969720661201")
payments = [Decimal("1000.00")] * 3
monthly, exact = lease_schedule(rate, payments)
published = [eur(b) for b in exact]
results.append(check("L16-02 taux mensuel", monthly, Decimal("0.01")))
results.append(check("L16-02 dette initiale", published[0], Decimal("2940.99")))
results.append(check("L16-02 intérêt économique du 1er mois", eur(exact[0] * monthly), Decimal("29.41")))
results.append(check("L16-02 dette après le 1er paiement", published[1], Decimal("1970.40")))
print("     échéancier publié (dette d'ouverture, intérêt publié, intérêt économique arrondi, écart) :")
for t, payment in enumerate(payments, start=1):
    interest_published = published[t] - published[t - 1] + payment
    interest_economic = eur(exact[t - 1] * monthly)
    print(f"     mois {t} : {published[t - 1]:>8} {interest_published:>6} {interest_economic:>6} {interest_published - interest_economic:>5}")
results.append(check("L16-02 dette finale", published[-1], Decimal("0.00")))

# L16-03 : ROU égal à la dette, amortissement linéaire sur 3 mois, charge PCG de janvier neutralisée.
rou = published[0]
depreciation = eur(rou / 3)
january_interest = published[1] - published[0] + payments[0]
results.append(check("L16-03 principal de janvier", payments[0] - january_interest, Decimal("970.59")))
results.append(check("L16-03 dotation de janvier", depreciation, Decimal("980.33")))
results.append(check("L16-03 ROU net fin janvier", rou - depreciation, Decimal("1960.66")))
results.append(check("L16-03 effet résultat avant impôts", payments[0] - january_interest - depreciation, Decimal("-9.74")))

# Mutation citée par L16-06 : r/12 au lieu du taux mensuel équivalent.
mutated_opening = eur(sum(p / (1 + rate / 12) ** t for t, p in enumerate(payments, start=1)))
results.append(check("L16-06 mutation r/12 détectée", mutated_opening != published[0], True))
print(f"     dette initiale avec r/12 : {mutated_opening}")

# P18-02 : fixture 2027 (O exploitation, V investissement, F financement, T impôts, A abandonnées).
O = 1_000_000 - 400_000 - 250_000 - 60_000 - 40_000
V, F, T, A = 12_000, -22_000, -60_000, 0
results.append(check("P18-02 exploitation", O, 250_000))
results.append(check("P18-02 avant financement et impôts", O + V, 262_000))
results.append(check("P18-02 avant impôts", O + V + F, 240_000))
results.append(check("P18-02 résultat", O + V + F + T + A, 180_000))

# P18-03 : MPM rapprochée du résultat d'exploitation, effets fiscaux fournis (aucun taux).
results.append(check("P18-03 MPM", O + 15_000 - 5_000, 260_000))
results.append(check("P18-03 effet fiscal fourni", -3_750 + 1_250, -2_500))
results.append(check("P18-03 ajustement après effet fiscal", (15_000 - 5_000) + (-2_500), 7_500))

# P18-04 : comparatif 2026 et ancienne présentation IAS 1.
O26 = 900_000 - 360_000 - 240_000 - 50_000 - 40_000
results.append(check("P18-04 exploitation 2026", O26, 210_000))
results.append(check("P18-04 avant financement et impôts 2026", O26 + 10_000, 220_000))
results.append(check("P18-04 avant impôts 2026", O26 + 10_000 - 20_000, 200_000))
results.append(check("P18-04 résultat 2026", O26 + 10_000 - 20_000 - 50_000, 150_000))
results.append(check("P18-04 résultat financier net IAS 1", 10_000 - 20_000, -10_000))

print(f"\n{sum(results)}/{len(results)} attendus du plan confirmés")
raise SystemExit(0 if all(results) else 1)
