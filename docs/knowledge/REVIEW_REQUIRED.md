# Elements a revoir

Liste exhaustive au 13 aout 2026 des elements conserves sans promotion en regle
applicable.

| Identifiant | Champs ou relation | Motif | Statut |
| --- | --- | --- | --- |
| `anc-2026-03:adopted-2026-03-06` | `homologationDate`, `effectiveFrom` | La page ANC emploie un libelle « Journal Officiel », mais le PDF consulte porte encore « En cours d'homologation ». Aucune date d'effet n'est inferee. | `pending_endorsement` |
| `anc-2026-04:adopted-2026-05-04` | `homologationDate`, `effectiveFrom` | Le PDF ANC porte encore « En cours d'homologation ». | `pending_endorsement` |
| `ifrs-required-2026:required-2026` | adoption UE norme par norme | Le volume Required 2026 etablit le statut IASB, pas l'adoption UE individuelle de chaque texte. | `review_required` |
| `ifrs-19:issued-2024-05-09` | `euEndorsementDate`, `euEffectiveFrom` | Le rapport EFRAG mis a jour le 23 juillet 2026 indique une adoption attendue au T3/T4 2026. | `pending` |
| Crosswalks `nep-*-isa-*` | equivalence de contenu paragraphe par paragraphe | L'ACPR confirme seulement le role de correspondance et la primaute des NEP; les equivalences detaillees restent a valider. | `review_required` |
| `pcg-ifrs-revenue` | correspondances ANC 2026-03 / IFRS 15 | Crosswalk de haut niveau; homologation ANC et differences par paragraphe a confirmer. | `review_required` |
| `pcg-ifrs-tax` | correspondances ANC 2026-04 / IAS 12 | Crosswalk de haut niveau; homologation ANC et differences par paragraphe a confirmer. | `review_required` |

## Sources officielles controlees

- ANC, PCG 2014-03 consolide au 1er janvier 2026 :
  <https://www.anc.gouv.fr/plan-comptable-general-0>
- ANC, reglements 2026-03 et 2026-04 :
  <https://www.anc.gouv.fr/normes-comptables-francaises/reglements-de-lanc>
- Legifrance, article A.47 A-1 :
  <https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000027804775/>
- BOFiP FEC, BOI-CF-IOR-60-40-20 :
  <https://bofip.impots.gouv.fr/bofip/9028-PGP.html/identifiant%3DBOI-CF-IOR-60-40-20-20170607>
- H2A, referentiel normatif :
  <https://h2a-france.org/referentiel-normatif-et-code-de-deontologie/acceder-au-referentiel-normatif/>
- IFRS Foundation, Required 2026 et taxonomie courante 2026 :
  <https://www.ifrs.org/news-and-events/news/2026/01/now-available-ifrs-accounting-standards-required-2026-two-editions/>
  et <https://www.ifrs.org/news-and-events/news/2026/02/ifrs-accounting-taxonomy-2025-to-remain-current-for-2026/>
- EFRAG, statut d'adoption UE :
  <https://www.efrag.org/en/financial-reporting/endorsement-status>
- EUR-Lex, adoption d'IFRS 18 :
  <https://eur-lex.europa.eu/eli/reg/2026/338/oj/fra>
- ACPR, IFRS et ISA :
  <https://acpr.banque-france.fr/fr/lacpr/lacpr-en-europe-linternational/cadre-comptable/standards-internationaux-cadre-comptable>
- CNCC, referentiel IFRS : <https://doc.cncc.fr/docs/referentiel-ifrs>

EY et PwC sont enregistres uniquement comme analyses secondaires. Leur presence
ne permet jamais de faire passer une exigence a `mandatory`.

## Index exhaustif controle par les tests

Versions ou statuts d'adoption a revoir :

- `anc-2026-03:adopted-2026-03-06`
- `anc-2026-04:adopted-2026-05-04`
- `ifrs-required-2026:required-2026`
- `ifrs-19:issued-2024-05-09`

Exigences bloquees en revue :

- `ifrs-19-eu-pending`
- `anc-2026-03-pending`
- `anc-2026-04-pending`

Crosswalks non promus en correspondances normatives :

- `nep-230-isa-230`
- `nep-300-isa-300`
- `nep-315-isa-315`
- `nep-320-isa-320`
- `nep-330-isa-330`
- `nep-450-isa-450`
- `nep-500-isa-500`
- `nep-530-isa-530`
- `nep-700-isa-700`
- `pcg-ifrs-revenue`
- `pcg-ifrs-tax`
