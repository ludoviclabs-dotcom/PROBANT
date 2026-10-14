## C11 — Clients, achats, cut-off et TVA : événements transversaux raccordés

Base `main` `300829b` (après la PR #91). Lot de consolidation C11 : les feuilles Clients et ventes, Achats / RPNE et TVA partagent désormais une identité d'événement, une frise de dates distinctes, un texte français applicable et un effet compté une fois. Aucun moteur fiscal ouvert, aucune règle d'âge, aucune TVA calculée.

### Ce qui change

- **Grille de cut-off 1.1.0** (`lib/workpapers/cutoff.ts`, `cutoff-rule.ts`) : chaque résultat cite le texte applicable à l'exercice (PCG 2024, ANC 2022-06, PCG consolidé 2026, ANC 2026-03) ; pour une vente sous ANC 2026-03, le contrat doit être conclu ou renouvelé après le 04/09/2026, sinon le texte antérieur s'applique ; contrat non daté ou daté du jour même : non concluant dans la chaîne réelle. Un avoir à cause antérieure devient un avoir à établir (4198) ou à recevoir (4098), plus une FAE ou une FNP négative. Grille des factures inchangée.
- **Résolveur C04** (`lib/knowledge/french-gaap.ts`) : arrêté d'homologation du 12/08/2026 lu (entrée en vigueur le 04/09/2026, lendemain de la publication) ; recueil PCG 2024 lu ; sujet `cutoff` ; `contractualApplicability()`.
- **Qualification TVA fermée** (`lib/tax/vat/exigibility.ts`) : exigibilité (vente) et droit à déduction (achat) pour les livraisons de biens et prestations de services en France, option pour les débits documentée par facture ; tout autre cas = information requise ; taux constaté toujours descriptif ; une date n'est qualifiée que si le registre fiscal et la version lue la couvrent.
- **Carte des événements transversaux** (`lib/workpapers/transversal-events.ts`, `-adapter.ts`) : projection en lecture seule des dernières versions exécutées ; frise facture / livraison / comptabilisation / paiements / clôture / exigibilité / période TVA observée ; un effet par événement (projection C05) ; procédure suggérée (C03) ; résidus par clé et règlements globaux non répartis ; dépendances d'invalidation par partie.
- **Chaîne réelle** : trois colonnes facultatives des factures (nature, option pour les débits, date de contrat) ; `GET /api/workpapers/payables?operation=events` (lit les feuilles TVA si la chaîne fiscale est activée) ; `/cutoff` affiche la carte.
- **C03** : procédures et assertions AAE / AAR ; règle Revenu reformulée selon le référentiel français (plus de « transfert du contrôle »), scénario STARTUP-CA-1 corrigé (487, pas « CCA »).

### Recette

Huit cas (livraison décembre / facture janvier, facture / prestation, service encaissé avec ou sans option, acompte, avoir post-clôture, fournisseur hors période, règlement partiel, source ultérieure incomplète), attendus comptables et fiscaux posés à la main dans `docs/recette/c11/RECETTE.md`, pont C05 et procédures C03 vérifiés. Voir le bilan dans `docs/probant-lots/HANDOFF.md`.

### Limites

Acomptes antérieurs à la clôture et cause datée des avoirs non sourcés dans la chaîne réelle ; option d'anticipation d'ANC 2026-03 non sourcée ; écarts du registre fiscal sur les fenêtres des art. 269 et 271 consignés, non corrigés (lot distinct, il change la couverture du moteur TVA). Contrat : `docs/mission-c11/CONTRAT.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
