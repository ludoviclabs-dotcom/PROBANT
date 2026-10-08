BEGIN;
-- Mission 11: dedicated append-only chain for the equity review (decisions and movements); other cycle tables are not reused.
CREATE UNIQUE INDEX IF NOT EXISTS clients_dossier_org_uq ON dossiers (id, organization_id);
CREATE TABLE IF NOT EXISTS eq_imports (
 organization_id uuid NOT NULL, dossier_id uuid NOT NULL, period_id text NOT NULL, id text NOT NULL,
 document_type text NOT NULL CHECK (document_type IN ('eq_balances','eq_entries','eq_variation','eq_decisions','eq_payments','eq_minutes')),
 preview jsonb NOT NULL, original_base64 text NOT NULL,
 CHECK (octet_length(decode(original_base64,'base64')) BETWEEN 1 AND 10485760),
 PRIMARY KEY (organization_id,dossier_id,period_id,id),
 FOREIGN KEY (dossier_id,organization_id) REFERENCES dossiers(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS eq_import_approvals (
 organization_id uuid NOT NULL, dossier_id uuid NOT NULL, period_id text NOT NULL, import_id text NOT NULL,
 actor_id text NOT NULL, approved_at timestamptz NOT NULL, preview_hash text NOT NULL,
 PRIMARY KEY (organization_id,dossier_id,period_id,import_id),
 FOREIGN KEY (organization_id,dossier_id,period_id,import_id) REFERENCES eq_imports(organization_id,dossier_id,period_id,id)
);
-- One head per tabular source type and one per PV / act piece reference (« eq_minutes:<pièce> »).
CREATE TABLE IF NOT EXISTS eq_source_heads (
 organization_id uuid NOT NULL, dossier_id uuid NOT NULL, period_id text NOT NULL,
 document_type text NOT NULL CHECK (document_type IN ('eq_balances','eq_entries','eq_variation','eq_decisions','eq_payments') OR document_type ~ '^eq_minutes:[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
 import_id text NOT NULL, PRIMARY KEY (organization_id,dossier_id,period_id,document_type),
 FOREIGN KEY (organization_id,dossier_id,period_id,import_id) REFERENCES eq_imports(organization_id,dossier_id,period_id,id)
);
CREATE TABLE IF NOT EXISTS eq_workpaper_heads (
 organization_id uuid NOT NULL, dossier_id uuid NOT NULL, period_id text NOT NULL, id text NOT NULL,
 version integer NOT NULL CHECK (version > 0), PRIMARY KEY (organization_id,dossier_id,period_id,id),
 FOREIGN KEY (dossier_id,organization_id) REFERENCES dossiers(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS eq_workpaper_versions (
 organization_id uuid NOT NULL, dossier_id uuid NOT NULL, period_id text NOT NULL, id text NOT NULL,
 version integer NOT NULL CHECK (version > 0), run jsonb NOT NULL,
 PRIMARY KEY (organization_id,dossier_id,period_id,id,version),
 FOREIGN KEY (organization_id,dossier_id,period_id,id) REFERENCES eq_workpaper_heads(organization_id,dossier_id,period_id,id)
);
CREATE TABLE IF NOT EXISTS eq_command_receipts (
 organization_id uuid NOT NULL, dossier_id uuid NOT NULL, period_id text NOT NULL, actor_id text NOT NULL,
 idempotency_key text NOT NULL, request_hash text NOT NULL, response jsonb NOT NULL,
 PRIMARY KEY (organization_id,dossier_id,period_id,actor_id,idempotency_key),
 FOREIGN KEY (dossier_id,organization_id) REFERENCES dossiers(id,organization_id) ON DELETE RESTRICT
);
CREATE FUNCTION probant_eq_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'EQ_APPEND_ONLY'; END;
$$;
CREATE TRIGGER eq_imports_immutable BEFORE UPDATE OR DELETE ON eq_imports FOR EACH ROW EXECUTE FUNCTION probant_eq_immutable();
CREATE TRIGGER eq_approvals_immutable BEFORE UPDATE OR DELETE ON eq_import_approvals FOR EACH ROW EXECUTE FUNCTION probant_eq_immutable();
CREATE TRIGGER eq_versions_immutable BEFORE UPDATE OR DELETE ON eq_workpaper_versions FOR EACH ROW EXECUTE FUNCTION probant_eq_immutable();
CREATE TRIGGER eq_receipts_immutable BEFORE UPDATE OR DELETE ON eq_command_receipts FOR EACH ROW EXECUTE FUNCTION probant_eq_immutable();
COMMIT;
