# TAX-03 — Registre de processeurs de documents

## Frontiere

Le registre route chaque depot selon `documentType`. Il importe et trace des
donnees documentaires ; il ne calcule ni IS, ni TVA, ni autre impot.

Ordre des processeurs :

1. `fec` — pipeline historique inchange ;
2. `liasse_2050_2059` ;
3. `liasse_2033` ;
4. `declaration_2065` ;
5. `declaration_tva_ca3` ;
6. `declaration_tva_ca12` ;
7. `balance` ;
8. `tax_notice` ;
9. `payroll_summary`.

Les trois derniers types disposent d'un processeur explicite de revue. Ils ne
sont plus rejetes pour absence de processeur, mais ne produisent aucun calcul.

## Format JSON PROBANT

```json
{
  "schemaVersion": "probant-tax-document-1",
  "documentType": "declaration_2065",
  "formNumber": "2065-SD",
  "formVintage": 2026,
  "siren": "123456789",
  "period": {
    "startDate": "2026-01-01",
    "endDate": "2026-12-31",
    "fiscalYear": 2026
  },
  "fields": [
    {
      "code": "C.RESULTAT_FISCAL_BENEFICE",
      "value": "1 234,56",
      "source": { "page": 1, "box": "C.RESULTAT_FISCAL_BENEFICE" }
    }
  ]
}
```

## Formats tabulaires PROBANT

Le CSV et la premiere ligne utile de chaque feuille XLSX portent les colonnes :

`documentType`, `formNumber`, `formVintage`, `siren`, `periodStart`,
`periodEnd`, `fiscalYear`, `fieldCode`, `rawValue`, puis facultativement
`dataType`, `page`, `box`.

Le parseur accepte les separateurs CSV virgule, point-virgule ou tabulation et
normalise les montants francais en centimes entiers. Une formule XLSX est
conservee comme valeur brute, mais son resultat mis en cache n'est jamais
utilise.

## Trace et portes de surete

Chaque champ conserve le document, la page ou feuille, la cellule ou case, la
valeur brute et normalisee, la version du parseur, la confiance, l'empreinte du
document et les avertissements.

Un champ est ineligible a un calcul automatique s'il est inconnu, duplique,
issu d'une formule, incoherent avec son signe, non normalisable, extrait d'un
PDF ou sous le seuil de confiance de 0,90. Un snapshot comportant un tel champ
ne peut pas avoir le statut `active`.

## PDF et fournisseur externe

Le PDF utilise uniquement la couche texte, en best-effort, sans OCR. Toute case
extraite reste `needs_manual_review` avec une confiance explicite. Un PDF sans
couche texte ne fournit aucun champ.

`TaxDocumentProvider` est un point d'extension facultatif. L'adaptateur API
Entreprise est desactive par defaut et n'effectue aucun appel reseau dans ce
jalon, meme lorsqu'une configuration est fournie.

