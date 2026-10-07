# Mission 06 — contrat de Synthèse et d’export Clients

Base : main `cc95c528eaa1db74aafa37cc42397310568f1a34` (Mission 05 intégrée). Branche `codex/mission06-clients-synthesis`. Date : 2026-10-07.

## Périmètre et programme

La Synthèse de mission est accessible depuis la Synthèse existante et la feuille pilote, sur `/clients-framing/synthesis`. Ce parcours n’utilise pas l’en-tête de dossier DEMO du tableau de bord. Les trois familles sont nommées : constats historiques DEMO SA, atelier synthétique, procédures de mission. Aucune anomalie historique n’est convertie en procédure exécutée.

Le programme fermé `clients.pilot.program@1.0.0` prévoit **une procédure** `clients.frame@1.0.0`, **deux rapprochements** GL / auxiliaire et auxiliaire / balance âgée, et trois sources requises. Les dénominateurs sont définis avant les résultats. Plusieurs feuilles requièrent une affectation explicite ; leur nombre n’augmente jamais le programme. Population / sélection, clés comparables et exclusions sont affichées séparément. Une clé inconnue ne vaut pas zéro.

Les conventions proviennent du contrat validé de l’adaptateur Mission 05. Les écarts net et brut restent propres à chaque rapprochement. Aucun événement économique n’étant validé par ce pilote, aucune exposition globale n’est construite. L’exception subsiste après traitement, approbation et verrouillage ; « revu » ne devient pas « conforme ».

## Identités, versions et décisions

Le serveur relit les versions immuables et les imports PostgreSQL dans le périmètre organisation / dossier / période, sous le verrou transactionnel du dossier. Le programme, l’affectation, les identités de résultat, empreintes, sources et localisateurs forment un état canonique SHA-256 partagé par écran et rapport. L’historique conserve les approbations et notes de demande de correction. Une nouvelle révision ou une source remplacée rend le travail ancien périmé sans modifier son ancienne décision.

Les liens de la file de travail contiennent dossier, période, identité de feuille, version et filtre métier ; les commentaires comportent aussi leur identité. L’examen d’une version épinglée est en lecture seule. Une reprise sur la version courante est une navigation explicite. Après traitement d’une exception, le bouton reste en place ; l’animation dure 180 ms après accusé serveur et respecte `prefers-reduced-motion`. Focus et position sont conservés.

## Export serveur

`POST /api/workpapers/clients/export` accepte seulement des sélecteurs, le type `diagnostic|approved`, le format `html|pdf|json|manifest` ou l’un des quatre CSV (exceptions, décisions, procédures, sources) et l’empreinte de l’état affiché. Le corps est strict, limité à 4 Kio. Aucun rôle, acteur, snapshot ou approbation JSON du navigateur n’est accepté comme autorité. Les permissions `dossier:export`, l’organisation, le dossier, la session et le CSRF utilisent l’autorisation existante.

Le serveur compare l’empreinte avant génération, puis relit les permissions, l’expiration et l’état après génération. Une divergence rend un 409, sans fichier. Le paquet approuvé exige une version courante et verrouillée, avec approbation liée au même contenu. Un diagnostic peut exposer une version historique ou périmée ; son titre, nom de fichier et manifeste le distinguent explicitement du paquet approuvé.

La date du paquet est celle de l’état serveur (dernier événement/source approuvée ou création du dossier), pas l’instant de chaque téléchargement. Les artefacts téléchargés séparément restent déterministes et vérifiables avec leur manifeste.

L’export réutilise les CSV neutralisés, les artefacts du manifeste d’intégrité et la conversion HTML → PDF existants. Il comprend résumé humain, programme, population et sélection, calculs par clé, exceptions, traitements, décisions, avant / après revue, anciennes versions, limites, sources et index des pièces avec localisateurs. Le HTML imprimable conserve Unicode, échappe les données, répète les en-têtes des tables à l’impression et coupe les mots longs. La pagination PDF est contrôlée pour chaque ligne, y compris un paragraphe dépassant une page.

Les fichiers binaires originaux **ne sont pas inclus** dans le paquet. L’index indique pièces attendues absentes, sources périmées et originaux à télécharger séparément. Le téléchargement original utilise le même contrôle de permission et les octets immuables de Mission 05. Le PDF est standard, sans validation PDF/A ; caractères hors Latin-1 remplacés, textes Unicode complets dans HTML / JSON. Aucun archivage certifié ni opinion automatique.

## Bornes et activation

La recette refuse plus de 500 versions, 24 Mio d’historique ou de sources matérialisées, 8 Mio de Synthèse et 16 Mio par export JSON, HTML ou PDF. Un dépassement échoue explicitement ; aucun magasin mémoire de secours. Aucun nouveau moteur ni cycle Clients complet ouvert. Aucune migration supplémentaire nécessaire : les versions et décisions de Mission 05 restent la source persistante.

Le flag existant `PROBANT_CLIENTS_DURABLE=disposable` reste obligatoire ; `VERCEL_ENV=production` ferme le parcours même avec ce flag. Aucun secret, flag Vercel ou environnement de production modifié.
