# Fiche de relecture — ce que tu dois vérifier et me rapporter

Préparée le 31/10/2026. Quatre blocs, par ordre d'importance. Seul le bloc A débloque l'exécution réelle de l'atelier Locations. Les blocs B à D sont des décisions ou des pièces que je ne peux pas obtenir seul.

Pour chaque ligne, une réponse courte suffit : **OK**, ou **écart** suivi d'une phrase (ce que dit le texte, ce que PROBANT devrait faire). Le modèle de réponse à recopier est au § E.

---

## A. Relecture nommée de la règle `ifrs16.leases` 1.0.0 (bloquant)

**Source à ouvrir.** Le texte officiel IASB d'IFRS 16, en accès libre : https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2026/issued/ifrs16.html

Je n'ai lu ce texte que par extraction outillée. Mes résumés (`SOURCES.md` § 2) doivent être confrontés au texte mot à mot, par toi. Je ne recopie pas le texte de la norme ici.

### A1. Les paragraphes : mon résumé est-il fidèle ?

| # | Paragraphes | Ce que PROBANT en a retenu | Question précise |
|---|---|---|---|
| A1.1 | § 5-8, annexe A « courte durée » | Exemption court terme choisie **par catégorie d'actif** ; durée de 12 mois au plus ; un contrat avec option d'achat n'est pas de courte durée. Exemption faible valeur choisie **contrat par contrat** | Le niveau de chaque élection (catégorie pour l'une, contrat pour l'autre) est-il exact ? L'option d'achat exclut-elle bien la courte durée ? |
| A1.2 | B3-B8 | Faible valeur jugée sur la valeur **à neuf**, indépendamment de la taille du preneur ; actif utilisable seul. **Aucun seuil en euros** n'est codé | Confirmes-tu que le texte ne fixe aucun seuil, et que PROBANT a raison de n'en mettre aucun ? |
| A1.3 | § 9-11 | Une location est le droit de contrôler l'utilisation d'un actif identifié pendant une période, contre contrepartie | Rien d'oublié dans la définition ? |
| A1.4 | § 12-15 | Composantes locatives et non locatives séparées, sauf élection § 15 faite **par catégorie d'actif** | Le niveau de l'élection § 15 est-il exact ? |
| A1.5 | § 18-21 | Durée = période non résiliable, plus les options raisonnablement certaines ; un contrat cesse d'être exécutoire quand les deux parties peuvent résilier sans pénalité plus qu'insignifiante | Formulation fidèle ? PROBANT n'en déduit aucune « durée de bail français » : tu confirmes que c'est un jugement à documenter ? |
| A1.6 | § 22-24 | Droit d'utilisation initial = dette + paiements d'avance − avantages reçus + coûts directs initiaux + remise en état. **En V1, seuls les contrats où ces compléments valent zéro sont calculés** | La liste des composantes du coût est-elle complète ? |
| A1.7 | § 26-27, annexe A (taux) | Actualisation au taux implicite s'il est facilement déterminable, sinon au taux marginal d'endettement ; paiements pris en compte : fixes, variables indexés, garantie de valeur résiduelle, option d'achat raisonnablement certaine, pénalités | L'ordre implicite puis marginal est-il exact ? La liste des paiements est-elle complète ? |
| A1.8 | § 29-33 | Modèle du coût ; amortissement jusqu'à la plus proche de la fin de la durée d'utilité et de la fin du contrat (sauf transfert de propriété ou option raisonnablement certaine) | Le « plus proche des deux » est-il exact ? C'est ce qui donne F09 (bloc A4) |
| A1.9 | § 36-38 | Intérêt à taux périodique constant sur le solde de la dette ; le paiement réduit la dette | Formulation fidèle ? |
| A1.10 | C1 | Application aux exercices ouverts à compter du 01/01/2019 | Date exacte ? |

### A2. B9-B33 : le dictionnaire des sources pose-t-il les bonnes questions ?

À lire : B9-B33, puis les champs `identifiedAsset`, `controlOfUse`, `identificationEvidence` et `serviceComponents` dans [`DICTIONNAIRE_L16.md`](./DICTIONNAIRE_L16.md).

| # | Ce que fait PROBANT | Question |
|---|---|---|
| A2.1 | « Actif identifié » se répond oui ou non, avec une preuve écrite. Un droit de substitution substantiel du fournisseur conduit à répondre « non » | Est-ce la bonne lecture de B13-B20 ? |
| A2.2 | « Contrôle de l'utilisation » se répond oui ou non, avec une preuve : avantages économiques et droit de diriger l'utilisation | Les deux critères de B21-B30 sont-ils bien ceux-là ? |
| A2.3 | Un « non » prouvé donne « non-location documentée » ; une réponse vide donne « à qualifier » ; rien n'est déduit du nom du bailleur ni du compte | D'accord ? |
| A2.4 | Composantes : aucune, séparées, élection § 15, ou présentes non séparées (à qualifier) | B32-B33 sont-ils correctement reflétés ? |

### A3. Conventions internes : les acceptes-tu comme choix de PROBANT ?

Ce ne sont pas des règles d'IFRS 16, et PROBANT ne les attribue jamais à la norme. Réponds oui ou non pour chacune :

1. taux saisi en **taux annuel effectif**, converti en taux mensuel `(1 + r)^(1/12) − 1` (jamais `r / 12`) ;
2. contrats de **1 à 120 mois** seulement ;
3. commencement **le 1er d'un mois**, loyers **mensuels, fixes, à terme échu**, échéances en fin de mois ;
4. calcul à 40 décimales, **soldes publiés arrondis au centime** (moitié à l'opposé de zéro), intérêt du mois = écart des soldes publiés + loyer ;
5. amortissement linéaire, **cumul arrondi au centime** ;
6. un contrat commencé avant l'exercice n'est calculé que si une **ouverture** (dette, droit d'utilisation, amortissements) est fournie **et égale au centime** au recalcul depuis l'origine ; sinon il reste en diagnostic ;
7. impôt différé **non calculé** (effet avant impôt seulement).

### A4. Cas de référence : refais-les toi-même (10 minutes avec un tableur)

Formules Excel (taux annuel `r`, loyer `L`, `n` mois) :
- taux mensuel : `=(1+r)^(1/12)-1` ;
- dette initiale : `=ARRONDI(VA(i;n;-L);2)` ;
- dette après `k` loyers : `=ARRONDI(VA(i;n-k;-L);2)`.

| Cas | Données | Attendus de PROBANT (exercice indiqué) |
|---|---|---|
| **F01** | 3 loyers de 1 000,00 €, 1 % par mois (r = 0,126825…), début 01/01/2027 | Dette initiale **2 940,99** ; au 31/01/2027 : intérêt **29,41**, dotation **980,33**, dette **1 970,40**, droit d'utilisation net **1 960,66**, effet sur le résultat **−9,74** |
| **F03** | 36 loyers de 1 000,00 €, 5 % annuel effectif, début 01/01/2027 | Dette initiale **33 421,27** ; 2027 : intérêts **1 398,49**, dotation **11 140,42**, dette **22 819,76**, net **22 280,85**, effet **−538,91** |
| **F08** | 60 loyers de 2 000,00 €, 4,5 %, début 01/01/2025, repris en 2027 avec une ouverture exacte | Dette initiale **107 515,21** ; 2027 : dette **45 863,63**, effet d'ouverture **−2 815,94** (en capitaux propres), effet de l'exercice **−41,61** |
| **F09** | Comme F03, mais durée d'utilité de 24 mois | 2027 : dotation **16 710,64**, net **16 710,63** |

Question : retrouves-tu ces montants ? Le détail ligne à ligne est dans `recette/attendus_l16.json`.

### A5. Si A1 à A4 sont OK : consigner la relecture

C'est **toi** qui modifies `lib/ifrs/leases/rule-review.ts` : je ne remplis pas ce fichier à ta place. Remplace `= null;` par :

```ts
= {
  reviewedBy: "Ton prénom et nom",
  reviewedAt: "2026-11-03T10:00:00.000Z",
  jurisdiction: "IASB",
  confirmations: { wordByWordParagraphs: true, b9ToB33: true, internalPoliciesAccepted: true, referenceCasesExamined: true },
};
```

Dis-moi ensuite « relecture consignée ». Je ferai la suite dans un commit à relire :

- tests qui vérifiaient l'état « à revoir » ;
- `data/ifrs/standards.yml` passé à `verified` ;
- `docs/knowledge/REVIEW_REQUIRED.md` mis à jour ;
- relance du parcours réel jusqu'au bout (calcul, revue, export revu, sélection au dossier de clôture).

**Si tu relèves un écart en A1 à A4, ne consigne rien** : rapporte-le, je corrige d'abord.

---

## B. Texte de l'Union européenne (non bloquant pour la juridiction IASB)

EUR-Lex me renvoie une page vide, et je ne contourne pas un accès bloqué. Si tu veux pouvoir choisir la juridiction « IFRS adoptées par l'UE » :

- télécharge le PDF du **règlement (UE) 2023/1803** (https://eur-lex.europa.eu/eli/reg/2023/1803/oj, version consolidée si elle est proposée) ;
- dépose-le dans un dossier local et donne-moi son chemin. Je lirai la partie IFRS 16 et je vérifierai qu'elle concorde avec le texte IASB.

---

## C. Capacité : quelle taille de portefeuille dois-je tenir ?

Aujourd'hui, un dossier tient **30 contrats de 120 mois**, 101 contrats de 36 mois ou 308 de 12 mois ; un portefeuille mixte se situe entre ces bornes. Réponds pour ton plus gros dossier réel, présent ou attendu :

| # | Question | Ta réponse |
|---|---|---|
| C1 | Nombre maximal de contrats de location dans un même dossier-exercice | |
| C2 | Durée la plus longue (mois), et durée la plus fréquente | |
| C3 | Ce dossier contient-il aussi beaucoup de données Clients ou Emprunts ? (le stockage est partagé, 24 Mio par dossier-exercice) | |

Si C1 et C2 restent sous la capacité actuelle, il n'y a rien à faire. Sinon je propose O4 : limites relevées pour Locations sur ton profil local, avec la lecture compacte et une progression affichée.

---

## D. IFRS 18 : on engage ou pas ? (décision prévue après L16-06)

L'atelier IFRS 18 classe des données **déjà préparées en IFRS** : il ne convertit pas un FEC PCG.

| # | Question | Ta réponse |
|---|---|---|
| D1 | Disposes-tu, pour au moins un dossier, d'une balance ou d'un compte de résultat **déjà en IFRS** ? | |
| D2 | Si non : veux-tu quand même l'atelier, en sachant qu'il restera en diagnostic sur tes dossiers PCG ? | |

---

## E. Modèle de réponse à recopier

```
A1.1 OK / écart : …
A1.2 …
…
A1.10 …
A2.1 … A2.4 …
A3 : 1 oui · 2 oui · 3 oui · 4 oui · 5 oui · 6 oui · 7 oui   (ou « non » + raison)
A4 : F01 OK · F03 OK · F08 OK · F09 OK   (ou montant trouvé)
A5 : relecture consignée le … (ou « pas encore »)
B : chemin du PDF UE, ou « plus tard »
C1 … · C2 … · C3 …
D1 … · D2 …
```
