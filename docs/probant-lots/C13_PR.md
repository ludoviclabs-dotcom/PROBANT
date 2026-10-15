## C13 — Emprunts : la chaîne réellement livrée

Base `main` `172ddd7` (après la PR #93). Le périmètre Emprunts n'avait sur `main` qu'une carte historique (rapprochement générique échéancier ↔ GL 16) ; le chantier local Mission 14, retrouvé hors du dépôt (`codex/mission14-loans`, non commité, base `5e49934`), est porté sur la base actuelle et complété. `/emprunts` est une feuille versionnée : import approuvé → population → exécution → pièces → relecture → verrouillage → export, reliée au dossier (C01) et persistante sur le profil personnel local (C07).

### Ce qui change

- **Moteur `loans.review` 1.0.0** (`lib/workpapers/loan-review.ts`, `loan-rules.ts`) sur `ClientsRuntime` / `WorkpaperService` / store `clients_*` existants : pont de principal par le rapprochement générique ; principal, intérêts et frais comparés séparément entre échéancier, GL et paiements ; intérêts recalculés en fractions exactes sur paramètres transcrits (taux fixe, ou index + marge aux **dates de révision contractuelles**, convention de jours nommée au contrat) ; intérêts courus de la dernière borne documentée ; confirmation − GL ; covenants repris avec leur **définition contractuelle et leur date**, sans ratio calculé. Aucun taux, aucune convention, aucun seuil par défaut.
- **Présentation au bilan** selon le texte applicable résolu par C04 (nouveau sujet `financial_debts` : PCG 2024, ANC 2022-06, PCG consolidé 2026, ANC 2026-03 sans changement des comptes 16) ; compte incohérent signalé, jamais reclassé ; instruments proches des fonds propres classés par le **moteur C09** existant (avance conditionnée → autres fonds propres, exclue des emprunts).
- **Cadrage du périmètre** sur la balance des comptes de dettes financières : écart par compte (« mismatch de périmètre »), jamais compensé.
- **Registre C01 1.3.0** : `dettes_financieres` devient un cycle du journal, procédure `loans.review` (famille `clients`, route `/emprunts`) observée par le dossier de clôture ; drapeau de chaîne `PROBANT_LOANS_DURABLE` (`disposable` / `personal`, refusé en production) dans le profil C07 et le lanceur local.
- **Migration additive `0020_loans_review`** (types de sources fermés) ; retour arrière refusé tant que des données Emprunts existent.
- **Écran `/emprunts`** dans la charte des feuilles : échéancier filtrable par mois, tables contrats / intérêts courus / cadrage, panneau de détail (pont, segments de taux cités, contrat et avenants, présentation, garanties et covenants, lignes sources), import, points cités, relecture (distincte ou personnelle nommée), export ; exemple synthétique en lecture seule `/emprunts?demo=1`.

### Recette

Attendus recalculés indépendamment (`docs/recette/c13/attendus.py`) : 100 000 − 10 000 = 90 000 et 3 % × 30 / 360 × 100 000 = 250 (exemple de contrat) ; taux absent → bloqué ; avenant et échéancier modifié ; frais séparés (+120 sur un GL qui les fusionne) ; remboursement anticipé ; mismatch de périmètre 15 000 ; résidu Atlas +10 000 sans dette omise affirmée. Bilan chiffré et captures : `docs/probant-lots/HANDOFF.md`.

### Limites

Emprunts simples en euros ; obligataires, convertibles, participatifs, devises, frais capitalisés, planchers / plafonds d'index, dérivés exclus et nommés ; packs transcrits à la main ; aucun DCF, LBO, ratio de covenant ni conformité de financement globale. Contrat : `docs/mission-c13/CONTRAT.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
