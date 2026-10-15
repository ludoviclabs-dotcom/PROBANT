"""Attendus de recette C13 (Emprunts) établis indépendamment du moteur TypeScript.

Arithmétique exacte (fractions), arrondi au centime une seule fois par intervalle,
demi-centime éloigné de zéro. Les conventions de jours sont des PARAMÈTRES DE CONTRAT
de l'exemple, jamais une règle générale :
  - ACT/360, ACT/365F : jours calendaires réels / 360 ou 365 (365 même en année bissextile) ;
  - 30E/360 : J1 = min(J1, 30), J2 = min(J2, 30) ;
  - 30/360 : J1 = 30 si J1 = 31 ; J2 = 30 si J2 = 31 et J1 (ajusté) >= 30.
Intervalle : départ inclus, fin exclue ; un mouvement de principal prend effet à sa date.

Exécution : python -I docs/recette/c13/attendus.py
"""
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from fractions import Fraction


def days(start: date, end: date, convention: str) -> int:
    if convention in ("ACT/360", "ACT/365F"):
        return (end - start).days
    d1, d2 = start.day, end.day
    if convention == "30E/360":
        d1, d2 = min(d1, 30), min(d2, 30)
    elif convention == "30/360":
        d1 = 30 if d1 == 31 else d1
        d2 = 30 if (d2 == 31 and d1 >= 30) else d2
    else:
        raise ValueError(convention)
    return 360 * (end.year - start.year) + 30 * (end.month - start.month) + (d2 - d1)


def base(convention: str) -> int:
    return 365 if convention == "ACT/365F" else 360


def cents(value: Fraction) -> Decimal:
    """Arrondi au centime, demi-centime éloigné de zéro (ROUND_HALF_UP en Decimal sur la valeur absolue)."""
    sign = -1 if value < 0 else 1
    exact = Decimal(abs(value.numerator)) / Decimal(value.denominator)
    return sign * exact.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def interest(principal: str, rate_percent: str, start: date, end: date, convention: str) -> Decimal:
    raw = Fraction(principal) * Fraction(rate_percent) / 100 * days(start, end, convention) / base(convention)
    return cents(raw)


D = date
rows = []

# Recette simple préétablie du prompt C13 : 100 000 − 10 000 = 90 000 ; 3 % pendant 30 jours en 30/360 sur 100 000 = 250.
rows.append(("C13-SIMPLE pont", Decimal("100000.00") - Decimal("10000.00")))
rows.append(("C13-SIMPLE jours 30/360 01/01→01/02", days(D(2026, 1, 1), D(2026, 2, 1), "30/360")))
rows.append(("C13-SIMPLE intérêt janvier", interest("100000", "3", D(2026, 1, 1), D(2026, 2, 1), "30/360")))
rows.append(("C13-SIMPLE intérêt mensuel après remboursement", interest("90000", "3", D(2026, 2, 1), D(2026, 3, 1), "30/360")))
rows.append(("C13-SIMPLE intérêts courus 01/12→01/01", interest("90000", "3", D(2026, 12, 1), D(2027, 1, 1), "30/360")))
# Contre-épreuve : la même période en ACT/360 ou 30E/360 donne d'autres montants (la convention est un paramètre).
rows.append(("contre-épreuve ACT/360 janvier", interest("100000", "3", D(2026, 1, 1), D(2026, 2, 1), "ACT/360")))
rows.append(("contre-épreuve 30E/360 01/01→31/01", interest("100000", "3", D(2026, 1, 1), D(2026, 1, 31), "30E/360")))
rows.append(("contre-épreuve 30/360 01/01→31/01", interest("100000", "3", D(2026, 1, 1), D(2026, 1, 31), "30/360")))

# C13-VARIABLE : Euribor 3 mois (valeurs synthétiques) + marge 1,20 %, ACT/360, révisions trimestrielles.
rows.append(("C13-VARIABLE intérêts d'ouverture T4 2025 (index 2,050)", interest("200000", "3.250", D(2025, 10, 1), D(2026, 1, 1), "ACT/360")))
rows.append(("C13-VARIABLE T1 (2,000 + 1,20)", interest("200000", "3.200", D(2026, 1, 1), D(2026, 4, 1), "ACT/360")))
rows.append(("C13-VARIABLE T2 (2,100 + 1,20)", interest("195000", "3.300", D(2026, 4, 1), D(2026, 7, 1), "ACT/360")))
rows.append(("C13-VARIABLE T3 (2,150 + 1,20)", interest("190000", "3.350", D(2026, 7, 1), D(2026, 10, 1), "ACT/360")))
rows.append(("C13-VARIABLE pont", Decimal("200000.00") - 3 * Decimal("5000.00")))

# C13-FRAIS : 2,40 % ACT/365F, frais de gestion 120 réglés séparément.
rows.append(("C13-FRAIS intérêts d'ouverture S2 2025", interest("120000", "2.40", D(2025, 7, 1), D(2026, 1, 1), "ACT/365F")))
rows.append(("C13-FRAIS S1 2026", interest("120000", "2.40", D(2026, 1, 1), D(2026, 7, 1), "ACT/365F")))
rows.append(("C13-FRAIS GL intérêt fusionné avec les frais", interest("120000", "2.40", D(2026, 1, 1), D(2026, 7, 1), "ACT/365F") + Decimal("120.00")))
rows.append(("C13-FRAIS intérêts courus S2 2026", interest("100000", "2.40", D(2026, 7, 1), D(2027, 1, 1), "ACT/365F")))

# C13-ATLAS (recette Mission 14 : 500 − 40, GL 470) : 2,00 % puis avenant 2,50 % au 01/07/2026, ACT/360.
rows.append(("C13-ATLAS intérêts d'ouverture T4 2025", interest("500000", "2", D(2025, 10, 1), D(2026, 1, 1), "ACT/360")))
rows.append(("C13-ATLAS T1 (après remboursement du 01/01)", interest("490000", "2", D(2026, 1, 1), D(2026, 4, 1), "ACT/360")))
rows.append(("C13-ATLAS T2", interest("480000", "2", D(2026, 4, 1), D(2026, 7, 1), "ACT/360")))
rows.append(("C13-ATLAS T3 (avenant 2,50 %)", interest("470000", "2.5", D(2026, 7, 1), D(2026, 10, 1), "ACT/360")))
rows.append(("C13-ATLAS intérêts courus T4 2026", interest("460000", "2.5", D(2026, 10, 1), D(2027, 1, 1), "ACT/360")))
rows.append(("C13-ATLAS pont attendu", Decimal("500000.00") - 4 * Decimal("10000.00")))
rows.append(("C13-ATLAS résidu GL 470 000 − attendu", Decimal("470000.00") - (Decimal("500000.00") - 4 * Decimal("10000.00"))))

# C13-REMBOURSE : 3 % 30E/360, intérêts annuels au 1er janvier, remboursement anticipé total au 01/09/2026.
rows.append(("C13-REMBOURSE intérêts d'ouverture 2025", interest("50000", "3", D(2025, 1, 1), D(2026, 1, 1), "30E/360")))
rows.append(("C13-REMBOURSE 01/01→01/09", interest("50000", "3", D(2026, 1, 1), D(2026, 9, 1), "30E/360")))

# Cadrage de périmètre : balance 168100 = 95 000 ; GL des contrats du pack sur 168100 = 0 (REMBOURSE) + 80 000 (référence inconnue).
rows.append(("Cadrage 168100 balance − GL des contrats", Decimal("95000.00") - (Decimal("0.00") + Decimal("80000.00"))))
# Intérêts courus des emprunts bancaires (164800) : SIMPLE 225 + VARIABLE 1 640 (GL) + FRAIS 1 209,86 + ATLAS 2 938,89.
rows.append(("Cadrage 164800 somme GL", Decimal("225.00") + Decimal("1640.00") + interest("100000", "2.40", D(2026, 7, 1), D(2027, 1, 1), "ACT/365F") + interest("460000", "2.5", D(2026, 10, 1), D(2027, 1, 1), "ACT/360")))

import sys

sys.stdout.reconfigure(encoding="utf-8")
for label, value in rows:
    print(f"{label:60} {value}")
