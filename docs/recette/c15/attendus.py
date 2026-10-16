"""Attendus de la recette finale C15, établis à la main AVANT l'exécution des moteurs.

Aucune importation du code PROBANT : chaque valeur vient des données synthétiques
ci-dessous, de l'arithmétique décimale exacte et des règles citées (rapport du
12/10/2026 § 6 et § 11, CGI art. 219 I cité par ce rapport). Les montants sont en euros, en Decimal.

Exécution : python -I docs/recette/c15/attendus.py  → écrit attendus.json à côté.
"""
from decimal import Decimal as D, ROUND_HALF_UP
import json
import sys
import pathlib

OUT = pathlib.Path(__file__).with_name("attendus.json")
cases = {}


def eur(x):
    return str(D(x).quantize(D("0.01")))


# M1 — Clients : résidus compensés (GL 80 ; auxiliaire 100 − 20 ; balance âgée 90 − 10)
gl = D("80.00")
aux = {"C1": D("100.00"), "C2": D("-20.00")}
aged = {"C1": D("90.00"), "C2": D("-10.00")}
residues = {k: aux[k] - aged[k] for k in aux}  # convention : auxiliaire − âgée
cases["M1_clients_residus"] = {
    "gl": eur(gl),
    "auxiliaire_total": eur(sum(aux.values())),
    "agee_total": eur(sum(aged.values())),
    "ecart_gl_auxiliaire": eur(gl - sum(aux.values())),
    "ecart_auxiliaire_agee_global": eur(sum(aux.values()) - sum(aged.values())),
    "residus_par_cle": {k: eur(v) for k, v in residues.items()},
    "residus_bruts_valeur_absolue": eur(sum(abs(v) for v in residues.values())),
    "accord_global_suffisant": False,
}

# M2 — Populations : absente ≠ vide ≠ connue
cases["M2_population"] = {
    "absente": {"ratio": None, "etat": "source manquante / non calculable", "jamais": ["0 %", "100 %"]},
    "vide_connue": {"ratio": None, "etat": "population vide déclarée", "assurance": None},
    # 24 contrôles conclus sur 24 n'élèvent pas l'étendue des écritures quand la population vaut 0.
    "controles_24_sur_24_ecritures_0": {"ratio_ecritures": None, "ratio_programme": "1.0000", "niveau_ecritures_affiche": "aucun niveau d'étendue"},
}

# M3 — Constat qualitatif (existence des stocks, pas de montant) : assertion conservée.
cases["M3_qualitatif"] = {"assertion": "existence", "montant": None, "present_matrice_constats": True, "cellule_compte": 1}

# M4 — Signal EUR : constaté 100 000, seuil de détection 50 000, aucun effet explicite.
cases["M4_signal_eur"] = {"constate": eur(100000), "seuil": eur(50000), "incidence_inferee": None, "jamais": eur(100000 - 50000)}

# M5 — Effets divergents et chevauchement
a, b = D("100.00"), D("120.00")
cases["M5_effets"] = {
    "meme_identite_100_120": {"statut": "conflit", "membres": 2, "montant_retenu": None, "jamais": [eur(a), eur(b)]},
    "repetition_meme_contenu": {"compte": 1, "montant": eur(a)},
    # A = {L1, L2} 100 ; B = {L2, L3} 120 ; montants positifs non alloués par ligne :
    # l'effet de l'union est au moins le plus grand des deux et au plus leur somme.
    "chevauchement_L1L2_L2L3": {"statut": "indéterminé", "borne_basse": eur(max(a, b)), "borne_haute": eur(a + b)},
}

# M6 — Net fiscal : ajustement +1 000, taux absent.
cases["M6_net_fiscal"] = {"brut": eur(1000), "impot": None, "net": None, "jamais": {"impot": eur(0), "net": eur(1000)}}

# M7 — Fin de plan : 12 000, résiduel 0, 60 mois, linéaire, exercice entier.
cost, life_months = D("12000.00"), 60
annual = cost * 12 / life_months
def charge(opening):
    remaining = max(D(0), cost - opening)
    return min(annual, remaining)
cases["M7_fin_de_plan"] = {
    "dotation_annuelle_plan": eur(annual),
    "cumul_ouverture_12000": {"dotation": eur(charge(D(12000))), "cumul_cloture": eur(D(12000) + charge(D(12000)))},
    "cumul_ouverture_10800": {"dotation": eur(charge(D(10800))), "cumul_cloture": eur(D(10800) + charge(D(10800)))},
    "cumul_ouverture_4800": {"dotation": eur(charge(D(4800))), "cumul_cloture": eur(D(4800) + charge(D(4800))), "vnc": eur(cost - D(4800) - charge(D(4800)))},
}

# M8 — Stock : coût 10, prix 2, coûts de sortie 5, quantité 10.
unit_cost, price, exit_cost, qty = D(10), D(2), D(5), D(10)
nrv_unit = price - exit_cost
gap = (unit_cost - nrv_unit) * qty
book = unit_cost * qty
loss = min(gap, book)
cases["M8_stock"] = {
    "valeur_actuelle_unitaire": eur(nrv_unit),
    "ecart_economique_brut": eur(gap),
    "valeur_comptable": eur(book),
    "perte_actif_bornee": eur(loss),
    "complement_a_qualifier": eur(gap - loss),
    "provision_automatique": None,
}

# M9 — IS annuel, cas standard (sans déficits, crédits, contributions) — CGI art. 219 I.
def round_euro(x):
    """Art. 219 I : bénéfice arrondi à l'euro le plus proche, 0,50 compté pour 1."""
    return D(x).quantize(D(1), rounding=ROUND_HALF_UP)
def is_pme(base):
    low = min(base, D(42500))
    return low * D("0.15") + max(D(0), base - D(42500)) * D("0.25")
cases["M9_is"] = {
    "pme_50000": eur(is_pme(D(50000))),
    "non_eligible_50000": eur(D(50000) * D("0.25")),
    "base_50000_49": {"base_arrondie": str(round_euro("50000.49")), "impot": eur(is_pme(round_euro("50000.49")))},
    "base_50000_50": {"base_arrondie": str(round_euro("50000.50")), "impot_avant_arrondi_liquidation": eur(is_pme(round_euro("50000.50")))},
    "exercice_18_mois": {"statut": "refus ciblé ou plafond proratisé tracé", "jamais": "plafond 42 500 appliqué sans prorata"},
}

# M10 — Millésime absent : exercice 2024 (barème 2024 non enregistré dans le registre).
cases["M10_millesime"] = {"exercice": 2024, "impot": None, "statut": "source/version requise", "jamais": "repli sur le barème 2026"}

# M11 — Deux feuilles, même procédure, populations distinctes (B1 verrouillée, B2 exécutée).
cases["M11_populations"] = {
    "sans_rattachement": {"statut": "feuille à rattacher", "feuilles_verrouillees": "0 / 1"},
    "B1_rattachee": {"feuilles_verrouillees": "1 / 1", "B2": "non rattachée"},
}

# M12 — Source remplacée après verrouillage.
cases["M12_invalidation"] = {"ancienne_version": "consultable avec ses sources", "travail_courant": "périmé", "export": "identifie la version (id, numéro, empreintes des sources)"}

# M12 bis — parcours réel : balance âgée remplacée après verrouillage (C1 90,00 → 85,00).
aged_v2 = {"C1": D("85.00"), "C2": D("-10.00")}
res_v2 = {k: aux[k] - aged_v2[k] for k in aux}
cases["M12_bis_balance_agee_remplacee"] = {
    "residus_par_cle_nouvelle_source": {k: eur(v) for k, v in res_v2.items()},
    "residus_bruts_nouvelle_source": eur(sum(abs(v) for v in res_v2.values())),
    "ecart_auxiliaire_agee_global_nouvelle_source": eur(sum(aux.values()) - sum(aged_v2.values())),
    "version_verrouillee": "inchangée, lisible et exportable avec l'ancienne balance (résidus +10,00 / −10,00)",
    "travail_courant": "périmé : révision requise ; le dossier de clôture signale la source remplacée",
}

# Parcours réel (Clients, profil personnel) : mêmes données que M1, mêmes attendus, plus la reprise.
cases["P_parcours_reel"] = {
    "donnees": "M1",
    "apres_arret_reprise": {"version_feuille": "identique", "empreintes_sources": "identiques", "export": "octets identiques ou différence limitée à l'horodatage d'édition, nommée"},
}

OUT.write_text(json.dumps(cases, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")
for name, value in cases.items():
    print(name, json.dumps(value, ensure_ascii=False))
