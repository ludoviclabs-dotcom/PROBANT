# Mission 12 — contrat Participations (2026-10-08)

Méthode interne de rapprochement, sans nouvelle règle comptable, fiscale ou juridique. Aucun DCF, aucune conversion automatique de valeur d’entreprise en fonds propres ou en valeur de détention. Le guide pédagogique et les normes ne sont pas utilisés pour produire une règle dans ce lot. Une qualification professionnelle indépendante demeure nécessaire avant un usage réel.

## Questions, assertions et risques

Les titres existent-ils dans le registre ? Quelle catégorie de droits s’applique au titre et à la date d’attribution de chaque distribution ? Le produit enregistré correspond-il au droit documenté ? L’encaissement est-il corroboré séparément ? La valeur externe concerne-t-elle la détention, la même date, la même base, la même devise et le même périmètre ? Quelle décision humaine motive la classification et une éventuelle proposition ?

Assertions internes proposées : rattachement des droits et écritures à une distribution ; exactitude arithmétique des droits homogènes ; allocation préférentielle sourcée ; distinction coût / dépréciation / valeur nette ; comparabilité des valeurs. Risques : prorata de capital abusif, droits hors date, allocation préférentielle absente, GL d’une autre distribution, valeur entreprise présentée comme détention, date/périmètre/base incompatibles, scénario favorable retenu implicitement, coût utilisé à la place de la valeur nette.

## Sources, population, période

Sept types fermés : registre, droits, décisions de distribution, GL, encaissements, coût/dépréciation, modèles externes. CSV UTF-8 ou XLSX, import commun avec mapping explicite, prévisualisation puis approbation. Registre et distributions forment la population `security_distribution` ; les autres sources corroborent sans gonfler le dénominateur. Toute sélection ou exclusion est motivée. Les unités sélectionnées sans association sont exposées et rendent le résultat non concluant.

Le mapping version `investment-review-1` utilise Key, Amount, Date et Details. Amount est un montant décimal EUR, Date une date civile ISO ; la feuille XLSX est explicite. Details contient les métadonnées structurées du pack. Les formats exacts sont validés par type dans `investment-dossier.ts`. Les CSV de recette fournis sont synthétiques et constituent des exemples de préparation de packs, pas des pièces d’une mission.

- Registre : identité et libellé du titre, intention, catégorie proposée, base comptable explicite (`cost` / `net_carrying`), libellé et périmètre. La mesure de population n’est pas additionnée aux distributions.
- Droits : titre, distribution, catégorie, période d’application, date d’attribution, numérateur/dénominateur, homogénéité. Pour des droits préférentiels, Amount est l’allocation fournie et une motivation est requise.
- Distribution : montant voté/fourni, identité du titre, date d’attribution et base.
- GL et encaissements : titre, distribution et base. Chaque date originale est conservée ; les GL sélectionnés sont rapprochés sur la période déclarée, les encaissements restent distincts.
- Coût/dépréciation : nature explicite, titre et base. Dépréciation absente ne signifie pas zéro. Un coût absent reste inconnu.
- Modèle externe : identifiant, version, nature présentée et nature d’origine, titre, périmètre, base, hypothèses et scénarios fournis. Aucun scénario n’est choisi par le système. Le choix du modèle examiné et de la version comparée est explicite.

Les CSV/XLSX citent document, pack, version/hash, date, feuille et ligne. Une page n’est pas inventée pour un tableau. L’import de pièces PDF et la lecture humaine de leur contenu ne sont pas implémentés dans ce lot structuré ; une source pack doit être préparée manuellement. Les modèles externes sont lus, jamais recalculés par un nouveau DCF.

## Calculs et états

Droits homogènes : distribution × numérateur/dénominateur, calcul rationnel entier, arrondi au centime. La formule exige des droits applicables au titre, à la distribution et à la date d’attribution. Droits hétérogènes : seule une allocation fournie, motivée, datée, de même base et sourcée peut servir ; le ratio simple est inapplicable.

Produit : somme des écritures explicitement rattachées à la distribution dans la période déclarée, moins droit attendu. Encaissements distincts, avec dates originales ; ils ne définissent pas le droit ou le produit. Les bases incompatibles ou sources absentes restent inconnues.

Base comptable : coût explicite ou coût moins dépréciation enregistrée et documentée, avec date/base compatibles. Aucun choix implicite entre brut et net. Valeur comparable : valeur de détention fournie, origine de même nature, même titre, périmètre, base, EUR et date de clôture ; hypothèses et preuves requises. Écart valeur = valeur externe − base déclarée. Chaque scénario reçoit son propre état et son propre écart ; aucune sélection favorable.

Badges : comparable, non comparable, source requise. Une valeur non comparable ou absente est **non concluante**, même après revue. Un écart calculé n’est pas une anomalie validée. La classification et la proposition nécessitent une décision humaine motivée, versionnée et citée ; aucune règle sur un seuil universel de détention. Proposition = documentée en attente de revue, jamais écriture automatique.

Vide, chargement, erreur, source manquante, partiel, prêt, calculé, en attente de revue, revu, verrouillé et périmé utilisent les états existants. Une modification de convention invalide résultat, notes, conclusion et approbation. Ajout ou remplacement d’une source pertinente invalide les travaux figés. Révisions et revues antérieures sont conservées.

## Accès et jugement

`InvestmentRuntime` réutilise ClientsRuntime, les transactions PostgreSQL, les sessions serveur, les droits organisation/dossier, les clés d’idempotence, la concurrence et WorkpaperService. Les types de source et le contexte réel `investments.review` sont fermés. Le rôle/auteur ne provient pas du JSON du navigateur. Soumission, revue distincte, auto-approbation refusée, verrouillage et nouvelle révision sont conservés. Diagnostic HTML/JSON protégé par droit de téléchargement et hash/version attendus ; originaux absents du paquet. Aucun paquet certifié ni signature revendiqué.

Le gate `PROBANT_INVESTMENT_DURABLE=disposable` est désactivé par défaut et refusé sur Vercel production. La route de démonstration exige le gate commun et l’origine locale exacte ; elle est en lecture seule. Aucun garde global retiré.

## Recette

| Cas synthétique | Résultat attendu |
| --- | --- |
| Distribution 40, droits homogènes 25 %, produit 9 | droit 10 ; écart produit −1 ; aucune écriture automatique |
| Droits préférentiels, allocation documentée 12 | droit 12 ; prorata simple écarté |
| Allocation préférentielle non motivée / absente | inconnu, source requise |
| Coût 100, dépréciation 10, valeur externe 85 | base nette 90 ; écart −5 ; coût explicite donnerait −15 |
| Modèle d’entreprise présenté comme détention | non comparable, non concluant |
| Modèle de fonds propres / date / périmètre / base incompatibles | non comparable, non concluant |
| Modèle ou coût/dépréciation requis absent | source requise, jamais zéro |
| Modèles v1 110 / v2 85, scénarios 70 / 85 / 120 | v2 explicitement choisie ; différences lisibles ; aucun optimum choisi |
| Proposition sans décision motivée ou valeur non comparable | aucune proposition |

## Parcours

`/participations` est lié depuis la synthèse. Population / Tests / Exceptions / Pièces / Revue : choix de sources et modèles, exclusions, tableau triable et filtrable, détail sur demande, preuves et différences de versions, diagnostic imprimable. Escape ferme le détail et restitue le focus à la ligne ; le tri/filtre et le défilement sont conservés. Table dense horizontalement défilable sur petit écran, badges textuels, focus visible et animations discrètes héritées de PROBANT ; reduced-motion supprime les animations de sélection.

`/participations?demo=1` : cinq participations, sept packs, dix unités, mêmes moteurs et imports ; `case=long` et `case=empty` servent la recette. La démonstration reste séparée des constats historiques DEMO SA.
