# ADR-007 — Authentification et autorisation

- **Statut** : accepté
- **Date** : 14 août 2026
- **Décision** : OIDC utilisateur avec session serveur opaque, autorisation par permission vérifiée dans chaque service, isolation par `organizationId` puis `dossierId`
- **Décidé dans** : PR-08 (préparé en PR-03)

## 1. Contexte

PR-03 a introduit un unique chemin d'authentification : un contexte signé HMAC transmis en en-tête (`x-probant-auth-context`). Il suffisait à rendre le mode persistant *fail-closed*, mais il n'authentifie personne : il transporte une décision prise ailleurs. Aucun navigateur ne peut l'émettre sans détenir le secret.

Il manque donc les trois éléments d'une release : une identité humaine vérifiable, une session de navigateur, et une isolation inter-organisations qui ne repose pas sur la bonne foi de l'appelant.

## 2. Les deux OIDC — distinction structurante

C'est la confusion la plus coûteuse du dossier, et elle est explicitement écartée ici.

```text
Utilisateur ──▶ PROBANT
    OIDC / SSO / MFA
    = identité HUMAINE
    = ce que décide cet ADR

PROBANT (Vercel) ──▶ AWS (S3, SQS)
    Vercel OIDC Federation
    = identité de WORKLOAD
    = credentials cloud temporaires
    = décidé par ADR-002, hors périmètre ici
```

Vercel OIDC Federation échange un jeton de déploiement contre des credentials AWS de courte durée. Ce n'est pas un fournisseur d'identité utilisateur, il n'émet aucun `id_token` pour une personne, et il ne doit jamais apparaître dans un chemin d'autorisation applicatif. Le paquet `@vercel/oidc-aws-credentials-provider` du dépôt relève exclusivement de ce second usage.

Concrètement : `lib/auth/oidc/` ne connaît pas Vercel, et `lib/storage/s3-object-storage.ts` ne connaît pas les sessions.

## 3. Décision — authentification

**Fournisseur** : OIDC générique, découvert via `/.well-known/openid-configuration`. Aucun fournisseur n'est codé en dur : Auth0, Entra ID, Keycloak ou Okta se configurent par variables d'environnement. Le choix du fournisseur est une décision d'exploitation, pas une décision d'architecture.

**Flux** : Authorization Code + PKCE S256, `state` et `nonce` aléatoires sur 256 bits, transaction scellée AES-256-GCM dans un cookie `__Host-` de 10 minutes. Le `code_verifier` ne quitte jamais le couple navigateur/serveur.

**Validation du jeton d'identité** : signature vérifiée contre le JWKS du fournisseur, algorithmes asymétriques uniquement (RS/PS/ES). `alg: none` et les familles HMAC sont refusées explicitement — une clé publique ne doit jamais pouvoir devenir un secret de vérification. Puis `iss`, `aud`, `azp`, `exp`, `iat`, `nbf` avec tolérance d'horloge configurable, et `nonce`.

**Session** : serveur, opaque, en base (`auth_sessions`). Le cookie ne porte que 256 bits d'aléa ; **seule l'empreinte SHA-256 est stockée**, comme un mot de passe. Une fuite de la base ne produit aucun cookie rejouable. Deux expirations : fenêtre glissante d'inactivité et plafond absolu que l'activité ne repousse jamais.

**Cookies** : `__Host-probant_session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, sans `Domain`. Le préfixe `__Host-` est un contrat vérifié par le navigateur : un sous-domaine compromis ne peut pas écrire la session. `SameSite=Lax` — et non `Strict` — parce que le retour depuis l'IdP est une navigation cross-site.

**CSRF** : trois barrières cumulées sur les méthodes mutantes — `SameSite=Lax`, contrôle d'origine (`Origin`, à défaut `Sec-Fetch-Site`, sinon refus), et jeton double-submit dérivé par HMAC de l'identifiant de session, transmis dans `x-probant-csrf`. Le jeton n'est pas stocké : il est recalculable, donc rien à invalider.

### Rejet des alternatives

| Alternative | Pourquoi écartée |
|---|---|
| JWT de session dans le cookie | Non révocable avant expiration. Un dossier d'audit doit pouvoir couper un accès immédiatement. |
| Mot de passe géré par PROBANT | Impose de gérer hachage, réinitialisation, rotation et MFA — trois surfaces d'attaque de plus pour aucun gain produit. |
| NextAuth / Auth.js | Ajoute une dépendance structurante et son modèle de session propre à un socle qui n'a besoin que du flux standard. Le code retenu tient en cinq modules sans dépendance nouvelle. |
| `Authorization: Bearer` depuis le navigateur | Impose de stocker le jeton en JavaScript, donc exfiltrable par XSS. Le cookie `HttpOnly` ne l'est pas. |

## 4. Décision — autorisation

**Rôles** : `preparer`, `reviewer`, `signer`, `admin`. `uploader` (PR-03) est un alias accepté en entrée, normalisé vers `preparer`, jamais produit.

**Les routes ne testent pas un rôle, elles exigent une permission.**

| Permission | preparer | reviewer | signer | admin |
|---|:--:|:--:|:--:|:--:|
| `dossier:read` | ✅ | ✅ | ✅ | ✅ |
| `dossier:upload` | ✅ | — | — | ✅ |
| `dossier:review` | — | ✅ | — | ✅ |
| `dossier:sign` | — | — | ✅ | ✅ |
| `dossier:export` | ✅ | ✅ | ✅ | ✅ |
| `organization:admin` | — | — | — | ✅ |

Ajouter un rôle modifie une table, pas N routes.

**L'IdP fait autorité sur les rôles** ; PROBANT fait autorité sur l'existence des dossiers et leur rattachement à une organisation. La table `memberships` est un **miroir auditable** des rôles émis — elle répond à « qui avait quel rôle, quand » — et n'est jamais la source de la décision.

### Isolation — trois verrous indépendants

1. **Permission** : le rôle porte-t-il l'action demandée ?
2. **Appartenance du dossier** : `assertDossierBelongsToPrincipal` relit l'organisation propriétaire en base. Ce contrôle est câblé **dans l'autorisation elle-même**, pas dans chaque route : une route ajoutée sans garde échoue en 401, elle ne passe pas en clair.
3. **Filtrage des données** : chaque requête de repository porte sa clause `organization_id`.

Un refus inter-organisations est **indistinguable d'un dossier inexistant** (`DOSSIER_NOT_FOUND`). Répondre 403 pour le dossier du voisin et 404 pour un identifiant inconnu suffirait à énumérer les dossiers des autres organisations.

### Le middleware n'autorise rien

`middleware.ts` pose des en-têtes de sécurité. Il ne prend aucune décision d'accès. Un middleware peut être contourné par une réécriture, une route ajoutée ou un appel interne ; une garde appelée dans le service ne le peut pas. Cette séparation est testée : les tests d'isolation s'exécutent sur `RequestAuthorizer`, sans middleware.

## 5. MFA — imposée par l'IdP, jamais réimplémentée

**PROBANT ne développe aucun second facteur.** Il constate celui que le fournisseur d'identité a exigé, via deux signaux normalisés du jeton :

- `acr` — contexte d'authentification atteint, comparé à `OIDC_REQUIRED_ACR` ;
- `amr` — méthodes réellement employées, comparées à `OIDC_REQUIRED_AMR`.

La session est conforme si **l'un** des `acr` attendus est atteint **ou** si **l'une** des méthodes `amr` attendues a été employée : les deux listes sont des alternatives, un IdP publiant rarement les deux.

Deux régimes : `required` refuse la session (403 `MFA_REQUIRED`), `audit_only` la laisse passer en enregistrant l'écart — pour mesurer le taux de conformité avant de basculer.

**Exiger la MFA sans dire à quoi la reconnaître est une erreur de configuration, pas un défaut permissif** : `OIDC_MFA_ENFORCEMENT=required` sans aucun `acr`/`amr` attendu fait échouer le démarrage. Sans ce garde-fou, toute session serait déclarée conforme.

Lors de la redirection, `acr_values` est transmis à l'IdP : PROBANT *demande* l'authentification forte, puis *vérifie* qu'elle a eu lieu. Demander sans vérifier ne prouverait rien.

## 6. Conséquences

- Le mode persistant échoue fermé si l'IdP, le secret de session, la base ou le stockage manquent. Le mode démo n'instancie rien de tout cela et reste consultable.
- Les workers d'ingestion conservent le contexte signé HMAC : ils n'ont pas de navigateur et leur identité est une identité de machine. Ce chemin n'obtient jamais « tous les dossiers de l'organisation » — il énumère explicitement les dossiers accordés.
- Les logs d'authentification ne consignent ni `sub`, ni e-mail, ni jeton : seuls l'organisation, le résultat et le `request_id`. Le sujet reste retrouvable via le magasin de sessions si une investigation le justifie.
- Une migration ajoute `users`, `memberships`, `auth_sessions` avec son script de retour arrière.
- Le provisionnement est *just-in-time* : le premier login crée l'utilisateur. Aucune administration préalable n'est nécessaire, mais aucun compte n'existe non plus sans passage par l'IdP.

## 7. Ce que cet ADR ne décide pas

- **Le fournisseur d'identité concret** et le mapping de ses claims (`organization_id`, `roles`) : décision d'exploitation, à consigner dans `docs/release/SOURCE_AUDIT.md` une fois le tenant créé.
- **La durée de rétention des sessions révoquées** : relève de la politique de conservation, non tranchée ici.
- **L'invitation d'un utilisateur dans une organisation** : le provisionnement JIT suppose que l'IdP porte déjà le rattachement. Un écran d'administration reste à concevoir.
- **La délégation entre organisations** (cabinet intervenant pour plusieurs entités) : un `organizationId` unique par session est retenu volontairement ; le multi-appartenance exigera un ADR distinct et un sélecteur d'organisation explicite.

## 8. Réversibilité

Le modèle est confiné à `lib/auth/`. Changer de fournisseur d'identité ne change aucune route : seule la configuration bouge. Remplacer la session serveur par un autre mécanisme suppose de réimplémenter `SessionStore` (deux implémentations existent déjà : Drizzle et mémoire) sans toucher aux gardes d'autorisation.

## Références

- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — flux, `nonce`, `acr`, `auth_time`
- [RFC 7636 — PKCE](https://datatracker.ietf.org/doc/html/rfc7636)
- [RFC 8176 — Authentication Method Reference Values](https://datatracker.ietf.org/doc/html/rfc8176) (`amr`)
- [RFC 6265bis — préfixes de cookies `__Host-`](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis)
- [Vercel OIDC Federation](https://vercel.com/docs/oidc) — identité de **workload**, à ne pas confondre
- [`ADR-002`](./ADR-002-object-storage.md) — identité workload vers AWS
- [`ADR-004`](./ADR-004-database-schema.md) — schéma PostgreSQL
