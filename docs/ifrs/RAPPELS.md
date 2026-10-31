# Rappels du chantier IFRS

Actions laissées en attente par décision de l'utilisateur. Une ligne se retire seulement quand l'action est faite, avec sa date et le commit.

| Ouvert le | Rappel | Pourquoi c'est en attente | Ce qui en dépend |
|---|---|---|---|
| 30/10/2026 | **Relecture personnelle nommée de la règle `ifrs16.leases` 1.0.0** : suivre [`REVUE_REGLE_IFRS16.md`](./REVUE_REGLE_IFRS16.md), puis consigner nom et date dans `lib/ifrs/leases/rule-review.ts` | L'utilisateur a choisi de faire C02 d'abord (30/10/2026). C'est un acte humain : aucune session ne le fait à sa place | Toute exécution réelle de la feuille Locations, dont le cadrage PCG et le retraitement de clôture (L16-03) ; le passage d'IFRS 16 à `verified` dans la base de connaissance ; la fin du parcours réel de L16-06 (`e2e/ifrs-l16-06-parcours-local.spec.ts`) et son verdict |
| 30/10/2026 | **Texte de l'Union européenne d'IFRS 16** (règlement 2023/1803) à lire quand EUR-Lex sera accessible | EUR-Lex renvoie une page vide (quatre essais au 29/10/2026), accès non contourné | La juridiction `EU_adopted` en réel (X33) |
| 30/10/2026 | **Décision de capacité de l'atelier Locations** : choisir parmi les options mesurées de [`CAPACITE_LOCATIONS.md`](./CAPACITE_LOCATIONS.md) (entrées par référence, résultat compacté, lecture compacte, résultat stocké une fois, limites du profil local, échéancier compact) | L16-06 a mesuré une capacité de 9 contrats de 120 mois (corrigée le 31/10/2026), limitée par le store partagé ; changer ce store touche aussi Emprunts et Clients, ce qui dépasse une correction ciblée | Un portefeuille réel de plus de 9 contrats de 120 mois (29 de 36 mois, 88 de 12 mois) ; la cible de charge de 1 000 × 120 ; C03 |
