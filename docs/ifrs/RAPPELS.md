# Rappels du chantier IFRS

Actions laissées en attente par décision de l'utilisateur. Une ligne se retire seulement quand l'action est faite, avec sa date et le commit.

| Ouvert le | Rappel | Pourquoi c'est en attente | Ce qui en dépend |
|---|---|---|---|
| 30/10/2026 | **Juridiction UE d'IFRS 16** : relecture personnelle nommée du texte UE en suivant [`FICHE_RELECTURE_UE.md`](./FICHE_RELECTURE_UE.md) (pages 815 à 846 du règlement 2023/1803), consignée dans `LEASE_RULE_REVIEW_EU` (`lib/ifrs/leases/rule-review.ts`) ; l'utilisateur a choisi de la faire le 02/11/2026 | Le PDF a été fourni par l'utilisateur et lu par outil le 02/11/2026 : même structure que le texte IASB pour les paragraphes de la règle ; seules diffèrent la cession-bail (2022) et le § 49 (IFRS 18), hors V1. La relecture mot à mot du texte français reste un acte humain, et la version consolidée n'est pas lue | La juridiction `EU_adopted` en réel (X33) ; la condition 3 de [`SOURCES.md`](./SOURCES.md) § 4 |
| 31/10/2026 | **Décision IFRS 18 (go / no-go)** : reportée | L'utilisateur n'a pas de balance déjà établie en IFRS (31/10/2026) ; rien ne justifie d'engager P18-01 | Les lots P18-01 à P18-06 ; le mapping P18 de la matrice L16-06, sans objet en attendant |

## Rappels clos

| Ouvert le | Rappel | Clos le | Comment |
|---|---|---|---|
| 30/10/2026 | Relecture personnelle nommée de la règle `ifrs16.leases` 1.0.0 | 31/10/2026 | Consignée par l'utilisateur, Ludo Labs, dans `lib/ifrs/leases/rule-review.ts`, pour la juridiction IASB, après lecture de § 8, 22-27, 32, de l'annexe A, de B3-B8 et de B13-B30 sur le texte IASB. Suite donnée : tests, base de connaissance (`verified`) et parcours réel complet, voir [`handoffs/L16-06.md`](./handoffs/L16-06.md) § 1. Commit `49f9a06` |
| 30/10/2026 | Cible de capacité de l'atelier Locations | 31/10/2026 | Cible de l'utilisateur : 20 contrats au plus par dossier-exercice, 108 mois au plus, 36 à 60 mois le plus souvent, avec un volume Clients et Emprunts modéré dans le même dossier. Elle tient dans la capacité de O1 + O2 (30 × 120, 101 × 36) : O4 n'est pas nécessaire. Mesuré le 31/10/2026 sur le code réel, à 20 contrats de 108 mois (graine 16006, `measureAt` de `scripts/ifrs/charge-l16-lib.ts`) : toutes les portes passent ; la plus serrée est l'aperçu de l'échéancier, à 59 % de sa limite (1,77 sur 3 Mio). Historique des feuilles 3,43 sur 24 Mio et sources 2,91 sur 24 Mio : ces deux budgets sont partagés avec Clients et Emprunts, qui gardent donc environ 20 Mio chacun ; une révision de la feuille Locations ajoute de l'ordre d'une chaîne d'historique. Le volume Clients et Emprunts « modéré » n'est pas mesuré dans le même dossier. Commit `49f9a06` |
