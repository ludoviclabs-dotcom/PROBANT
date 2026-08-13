# Politique des sources de connaissance

Cette politique gouverne uniquement le **plan connaissance** de PROBANT. Elle ne
modifie ni le dashboard ni les donnees d'un dossier client.

## Classes et hierarchie

PROBANT conserve separement la nature de la source (`sourceNature`), son niveau
d'autorite (`authorityLevel`) et son rang (`authorityRank`). Le rang ne transforme
jamais une doctrine ou une analyse en texte obligatoire.

| Rang | Classe | Sources de reference | Usage autorise |
| --- | --- | --- | --- |
| 1 | Droit, reglement et doctrine administrative officielle | Legifrance, ANC, BOFiP, EUR-Lex, EFRAG | Regles obligatoires uniquement lorsque le texte est en vigueur et le paragraphe cite |
| 2 | Normes professionnelles francaises | H2A, NEP homologuees | Referentiel principal d'une mission d'audit legale francaise |
| 3 | Normes internationales | IFRS Foundation / IASB; ISA en correspondance | IFRS selon statut IASB **et** adoption UE; ISA comme correspondance internationale |
| 4 | Doctrine et supervision professionnelles | CNCC, ACPR, experts-comptables.fr | Explication, doctrine ou position de supervision |
| 5 | Analyse secondaire | EY, PwC | Analyse interpretative seulement, jamais source d'une obligation |
| 6 | Regles internes | Parametres PROBANT | Heuristiques et seuils internes explicitement non opposables |

## NEP et ISA

Les NEP homologuees constituent le referentiel principal pour l'audit legal en
France. Une relation NEP/ISA porte obligatoirement
`international_correspondence_only`. Elle ne rend pas l'ISA directement applicable
en France. La page ACPR sur les ISA est enregistree comme doctrine de supervision :
elle rappelle que, faute d'adoption des ISA par la Commission europeenne, les NEP
francaises s'appliquent.

## IFRS et adoption europeenne

Une version de norme IFRS ne peut etre exploitee sans les deux plans distincts :

- `iasbStatus` et `iasbEffectiveFrom` pour le statut emis par l'IASB ;
- `euEndorsementStatus`, `euEndorsementSource`, et le cas echeant
  `euEndorsementDate` et `euEffectiveFrom`, pour l'Union europeenne.

`IFRS Accounting Standards—Required 2026` decrit les textes requis par l'IASB au
1er janvier 2026. Il ne prouve pas, a lui seul, l'adoption UE de chaque texte.
IFRS 18 est suivie avec le reglement (UE) 2026/338. IFRS 19 reste `pending` dans
le rapport EFRAG du 23 juillet 2026.

Le texte integral des normes IFRS n'est pas stocke. PROBANT conserve uniquement
les metadonnees, references, courts extraits lorsque la licence le permet, et des
resumes originaux limites par le schema Zod.

## Cycle de vie d'une version

Chaque `SourceVersion` gere `publicationDate`, `effectiveFrom`, `effectiveTo`,
`status`, `lastVerifiedAt`, `supersedes`, `supersededBy` et `contentHash`. Les dates
inconnues restent absentes : elles ne sont jamais devinees. Une version remplacee
ne peut rester `effective` que si `supersessionJustification` documente une
coexistence reelle.

Les statuts autorises sont : `effective`, `future`, `pending_endorsement`,
`superseded`, `review_required` et `internal`.

`contentHash` est le SHA-256 de l'identifiant normalise du snapshot de metadonnees.
Il ne pretend pas etre le hash du texte integral d'une publication sous licence.

## Validation et revue

Le validateur refuse notamment :

- une obligation fondee sur EY, PwC ou une autre analyse secondaire ;
- une statistique sans periode ou unite ;
- une IFRS sans statut IASB, date d'effet IASB, statut UE et source du statut UE ;
- une regle chiffree obligatoire sans source et reference de paragraphe ;
- une version remplacee simultanement active sans justification ;
- une correspondance NEP/ISA presentee comme directement applicable ;
- un resume IFRS anormalement long pouvant ressembler a une copie du texte.

Tout champ non verifie est liste dans `SourceVerification.unverifiedFields` et
repris dans [REVIEW_REQUIRED.md](./REVIEW_REQUIRED.md).

## Domaines autorises

Les domaines publics sont limites a ceux demandes pour le projet :
`legifrance.gouv.fr`, `anc.gouv.fr`, `bofip.impots.gouv.fr`, `h2a-france.org`,
`ifrs.org`, `eur-lex.europa.eu`, `efrag.org`, `acpr.banque-france.fr`, `cncc.fr`,
`doc.cncc.fr`, `experts-comptables.fr`, `ey.com` et `pwc.fr`. Le schema interne
`internal://probant/...` est reserve aux parametres internes.
