-- Annulation de 0003 : identités utilisateur, sessions serveur et compteurs de quota.
-- Ordre inverse des dépendances : les tables filles d'abord.
DROP INDEX IF EXISTS "auth_sessions_token_sha256_uq";
DROP INDEX IF EXISTS "auth_sessions_user_created_idx";
DROP INDEX IF EXISTS "auth_sessions_expiry_idx";
DROP INDEX IF EXISTS "memberships_user_idx";
DROP INDEX IF EXISTS "upload_quota_counters_window_idx";
DROP INDEX IF EXISTS "users_external_subject_uq";
DROP TABLE IF EXISTS "auth_sessions";
DROP TABLE IF EXISTS "memberships";
DROP TABLE IF EXISTS "upload_quota_counters";
DROP TABLE IF EXISTS "users";
DROP TYPE IF EXISTS "probant_role";
