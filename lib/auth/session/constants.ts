/**
 * Noms de cookies et d'en-têtes de session.
 *
 * Module volontairement **sans dépendance Node** : il est importé aussi bien
 * par le code serveur (`cookie.ts`, qui utilise `node:crypto`) que par le
 * client (`csrf-client.ts`). Y ajouter un import de `node:*` ferait entrer
 * `node:crypto` dans le bundle navigateur et casserait le build.
 *
 * Le préfixe `__Host-` est un contrat vérifié par le navigateur : il n'accepte
 * le cookie que s'il est `Secure`, `Path=/` et **sans** attribut `Domain`. Un
 * sous-domaine compromis ne peut donc pas écrire la session.
 */
export const SESSION_COOKIE = "__Host-probant_session";
export const OIDC_TRANSACTION_COOKIE = "__Host-probant_oidc_tx";
export const CSRF_HEADER = "x-probant-csrf";
