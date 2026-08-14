import { z } from "zod";

/**
 * Rôles PROBANT — ADR-007.
 *
 * Les quatre rôles sont ceux du plan de refonte : `preparer` prépare le
 * dossier et dépose les pièces, `reviewer` décide des constats, `signer`
 * scelle le dossier de preuve, `admin` administre l'organisation.
 *
 * `uploader` est l'ancien nom de `preparer` (PR-03). Il reste accepté en
 * entrée pour ne pas invalider les contextes signés déjà émis, mais il n'est
 * jamais produit : `normalizeRole` le convertit avant toute décision.
 */
export const PROBANT_ROLES = ["preparer", "reviewer", "signer", "admin"] as const;

export type ProbantRole = (typeof PROBANT_ROLES)[number];

const LEGACY_ROLE_ALIASES: Record<string, ProbantRole> = {
  uploader: "preparer",
};

export const roleSchema = z
  .string()
  .transform((value) => LEGACY_ROLE_ALIASES[value] ?? value)
  .pipe(z.enum(PROBANT_ROLES));

/**
 * Permissions vérifiées par les services.
 *
 * Les routes ne testent jamais un rôle en dur : elles exigent une permission.
 * Ajouter un rôle revient donc à modifier une seule table, pas N routes.
 */
export const PERMISSIONS = [
  "dossier:read",
  "dossier:upload",
  "dossier:review",
  "dossier:sign",
  "dossier:export",
  "organization:admin",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Readonly<Record<ProbantRole, readonly Permission[]>> = {
  preparer: ["dossier:read", "dossier:upload", "dossier:export"],
  reviewer: ["dossier:read", "dossier:review", "dossier:export"],
  signer: ["dossier:read", "dossier:sign", "dossier:export"],
  admin: [
    "dossier:read",
    "dossier:upload",
    "dossier:review",
    "dossier:sign",
    "dossier:export",
    "organization:admin",
  ],
};

export function normalizeRole(value: string): ProbantRole | null {
  const parsed = roleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Ignore silencieusement les rôles inconnus émis par l'IdP — ils n'accordent rien. */
export function normalizeRoles(values: readonly string[]): ProbantRole[] {
  const seen = new Set<ProbantRole>();
  for (const value of values) {
    const role = normalizeRole(value);
    if (role) seen.add(role);
  }
  return PROBANT_ROLES.filter((role) => seen.has(role));
}

export function permissionsFor(roles: readonly ProbantRole[]): Permission[] {
  const granted = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) granted.add(permission);
  }
  return PERMISSIONS.filter((permission) => granted.has(permission));
}

export function hasPermission(
  roles: readonly ProbantRole[],
  permission: Permission,
): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role].includes(permission));
}

/**
 * Rôle d'acteur consigné dans un `ReviewEvent`.
 *
 * L'historique de revue doit nommer le rôle réellement exercé : on retient le
 * rôle le plus spécifique qui porte la permission utilisée, et `admin`
 * seulement si aucun rôle métier ne la porte.
 */
export function actingRoleFor(
  roles: readonly ProbantRole[],
  permission: Permission,
): ProbantRole {
  const business = PROBANT_ROLES.filter(
    (role) => role !== "admin" && roles.includes(role) && ROLE_PERMISSIONS[role].includes(permission),
  );
  if (business.length > 0) return business[0];
  return "admin";
}
