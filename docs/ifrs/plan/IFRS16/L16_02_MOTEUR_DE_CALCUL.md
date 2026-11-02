# Prompt L16-02 — Calculer dette et droit d’utilisation de manière reproductible

Prérequis : L16-01 terminé, C00–C02 et contrats communs lus. Applique `AGENTS.md`. Implémentation et tests locaux, base jetable uniquement pour toute migration ; aucun déploiement. Ce lot ne génère pas encore le bundle comptable sélectionnable.

## Périmètre fermé

Respecte exactement la V1 de l’architecture : location preneur EUR, composante isolée, paiements mensuels fixes à terme échu, mois entiers, modèle du coût, durée et taux justifiés. Tous les cas bloquants inventoriés en L16-01 doivent être refusés ici également, même si un appel API contourne l’interface. Les seuils techniques ne sont pas normatifs. Le contrôle de règlement concerne les échéances exigibles à la date de revue, pas les loyers futurs non échus ; conserver les deux rôles dans le résultat.

Lis S16 §22–38 et S16-R pour les règles utilisées ; si un pack applicable n’a pas été vérifié, autoriser les scénarios étiquetés, pas une exécution réelle faussement validée. Réutilise les types, registre et service existants ; n’appelle pas le calcul Emprunts comme s’il avait la même sémantique.

## Calcul demandé

Pour le cas V1 sans autre composante initiale, implémente un échéancier à flux explicites :

\[
i=(1+r)^{1/12}-1,\quad D_0=\sum_{t=1}^{n}\frac{L_t}{(1+i)^t},\quad I_t=D_{t-1}i,\quad D_t=D_{t-1}+I_t-L_t.
\]

`r` est un taux annuel effectif décimal validé ; `i` le taux mensuel. Pour `r=0`, aucune division par zéro ni formule d’annuité instable. Le raccourci `r/12` est interdit si `r` est effectif. N’utilise pas la valeur de marché de l’actif comme dette initiale. ROU initial égal à la dette seulement dans le périmètre où les autres composantes ont été explicitement déclarées nulles et vérifiées.

Amortissement du ROU : méthode linéaire justifiée, durée mensuelle retenue selon le contrat V1 ; cumul antérieur et base restante conservés. Pas d’amortissement au-delà de la base ni de valeur nette négative créée par l’arrondi. La dette, le ROU et les charges restent trois objets distincts.

### Précision et publication

Choisis une arithmétique décimale déterministe, après inspection des dépendances et documentation officielle de la bibliothèque retenue. Précision interne proposée : 40 chiffres significatifs, arrondi de sortie au centime, moitié à l’opposé de zéro. C’est une convention technique à enregistrer et tester, pas une prescription IFRS. Aucune addition financière en flottants JS.

Conserve les valeurs économiques de haute précision. Pour publier des mouvements comptables cohérents, dérive les mouvements des soldes d’ouverture/clôture arrondis et des paiements en centimes. Trace distinctement tout écart avec l’intérêt économique arrondi ; pas de centime caché dans une dernière échéance ou un compte « divers ». La règle de raccord d’arrondi, sa borne et sa justification doivent être explicites et validées dans les tests avant génération d’écritures. Un résidu économique inexpliqué n’est jamais forcé à zéro.

## Résultat canonique et orchestration

Par contrat/version/période : paramètres, détail des paiements, facteurs, dette ouverture/clôture, intérêts, principal, ROU brut/cumul/net, amortissement courant, valeurs exactes/arrondies, écarts d’arrondi, preuves et limites. Pour le portefeuille : agrégats déterminés, population calculable et contrats bloqués à part. Aucun « total complet » si un élément pertinent reste inconnu ; un total du seul sous-ensemble calculé porte ce libellé.

Mesure avant de décider synchrone ou job local. Si un traitement dépasse le budget fixé, crée une exécution locale persistée/reprenable avec lots et publication atomique, compatible avec C01 ; la progression compte les contrats réellement traités. Empreinte par contrat + politique + règle ; recalcul ciblé, cache uniquement sur dépendances exactes, jamais réutilisé entre dossiers.

## Oracle de recette indépendant

Établis les attendus hors moteur TypeScript, par exemple en arithmétique décimale indépendante, sans importer son code. Fixture synthétique contrôlable : trois paiements mensuels de 1 000,00 €, taux annuel effectif `0.126825030131969720661201` correspondant à 1 % mensuel, commencement 01/01/2027, échéances 31/01, 28/02, 31/03 ; élection explicite de ne pas appliquer l’exemption court terme dans cette classe pour ce scénario.

Repères : dette initiale arrondie 2 940,99 € ; dette après premier paiement 1 970,40 € ; ROU initial 2 940,99 € ; intérêt économique du premier mois arrondi 29,41 €. Les mouvements publiés doivent suivre la convention d’arrondi documentée, pas des attendus ajustés après coup. Ajoute zéro taux, taux annuel 5 % converti correctement, année bissextile, 120 mois, terme final, gros montant et contrat historique avec ouverture cadrée.

Teste aussi : taux/durée absents ; dates non admises ; paiement réel discordant ; source changée pendant un job ; interruption/reprise ; deux exécutions concurrentes ; ordre de contrats différent donnant les mêmes agrégats ; aucune publication partielle comme terminée. Égalités au centime pour les valeurs publiées et précision interne vérifiée séparément.

Livre moteur/adaptateur, oracle, fixtures, tests et `docs/ifrs/handoffs/L16-02.md`. N’implémente pas les cas exclus pour augmenter artificiellement la couverture.
