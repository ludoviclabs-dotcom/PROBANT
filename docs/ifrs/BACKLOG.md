# Backlog du chantier IFRS

Améliorations repérées hors du périmètre d'un lot. Elles ne sont pas réalisées ; chacune garde sa source, son bénéfice et ses dépendances. Les actions qui attendent une décision ou une pièce de l'utilisateur sont dans [`RAPPELS.md`](./RAPPELS.md).

| Id | Amélioration | Source | Bénéfice | Dépendances |
|---|---|---|---|---|
| B1 | Déclarer à l'écran une base qui inclut déjà le retraitement (identités incluses), pour obtenir le refus motivé sans passer par l'API | C03, étape 5 (`handoffs/C03.md` § 7) | Le cas « base déjà retraitée » devient exerçable par l'utilisateur ; aujourd'hui seuls « aucun » et « inconnu » sont proposés | `ClosingIfrsWorks.tsx` ; le refus `L16_BUNDLE_ALREADY_INCLUDED` existe côté serveur |
| B2 | Recalcul ciblé : réutiliser les résultats des contrats dont l'empreinte n'a pas changé lors d'une révision | C03, charge (§ 5) ; L16-06 § 5.2 | 4,2 s → quelques dizaines de ms à 1 000 × 120 pour une révision portant sur un contrat. Sans effet utile à la cible actuelle (78 ms) | Empreintes par contrat (`dependencyFingerprint`) ; registre de calcul partagé, qui hache la population entière |
| B3 | Export synthétique accessible sur le serveur du profil local (aujourd'hui `DEMONSTRATION_DISABLED`) | C03, étape 6 | La simulation se télécharge aussi sur le poste personnel | `lease-demo-guard.ts` ; décision sur l'ouverture de la démonstration hors serveur de recette |
| B4 | Capacité au-delà de 30 × 120 : O4 (limites relevées pour Locations sur le profil local), puis O3 / O5 | `CAPACITE_LOCATIONS.md` | Portefeuilles plus grands que la cible déclarée (20 × 108) | Décision de l'utilisateur ; stockage commun pour O3 |
| B5 | Atelier IFRS 18 (P18-01 → P18-06), puis la partie P18 de C03 | Plan `plan/IFRS18/`, C03 étapes 3, 4 et 6 | Présentation du résultat, MPM, transition | Décision go / no-go reportée ([`RAPPELS.md`](./RAPPELS.md)) ; une base `IFRS_prepared` |
