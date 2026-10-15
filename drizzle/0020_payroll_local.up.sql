BEGIN;
-- C12: additive local payroll/leave chain; the existing dossier and version contracts are reused.
CREATE UNIQUE INDEX IF NOT EXISTS clients_dossier_org_uq ON dossiers (id, organization_id);
CREATE TABLE IF NOT EXISTS hr_imports (
 organization_id uuid NOT NULL, dossier_id uuid NOT NULL, period_id text NOT NULL, id text NOT NULL,
 document_type text NOT NULL CHECK (document_type IN ('payroll_journal','payroll_ledger','payroll_declaration','payroll_payments','payroll_events','payroll_leave')),
 preview jsonb NOT NULL, original_base64 text NOT NULL,
 CHECK (octet_length(decode(original_base64,'base64')) BETWEEN 1 AND 10485760),
 PRIMARY KEY (organization_id,dossier_id,period_id,id),
 FOREIGN KEY (dossier_id,organization_id) REFERENCES dossiers(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS hr_import_approvals (
 organization_id uuid NOT NULL, dossier_id uuid NOT NULL, period_id text NOT NULL, import_id text NOT NULL,
 actor_id text NOT NULL, approved_at timestamptz NOT NULL, preview_hash text NOT NULL,
 PRIMARY KEY (organization_id,dossier_id,period_id,import_id),
 FOREIGN KEY (organization_id,dossier_id,period_id,import_id) REFERENCES hr_imports(organization_id,dossier_id,period_id,id)
);
CREATE TABLE IF NOT EXISTS hr_source_heads (
 organization_id uuid NOT NULL, dossier_id uuid NOT NULL, period_id text NOT NULL, document_type text NOT NULL,
 import_id text NOT NULL, PRIMARY KEY (organization_id,dossier_id,period_id,document_type),
 FOREIGN KEY (organization_id,dossier_id,period_id,import_id) REFERENCES hr_imports(organization_id,dossier_id,period_id,id)
);
CREATE TABLE IF NOT EXISTS hr_workpaper_heads (
 organization_id uuid NOT NULL, dossier_id uuid NOT NULL, period_id text NOT NULL, id text NOT NULL,
 version integer NOT NULL CHECK (version > 0), PRIMARY KEY (organization_id,dossier_id,period_id,id),
 FOREIGN KEY (dossier_id,organization_id) REFERENCES dossiers(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS hr_workpaper_versions (
 organization_id uuid NOT NULL, dossier_id uuid NOT NULL, period_id text NOT NULL, id text NOT NULL,
 version integer NOT NULL CHECK (version > 0), run jsonb NOT NULL,
 PRIMARY KEY (organization_id,dossier_id,period_id,id,version),
 FOREIGN KEY (organization_id,dossier_id,period_id,id) REFERENCES hr_workpaper_heads(organization_id,dossier_id,period_id,id)
);
CREATE TABLE IF NOT EXISTS hr_command_receipts (
 organization_id uuid NOT NULL, dossier_id uuid NOT NULL, period_id text NOT NULL, actor_id text NOT NULL,
 idempotency_key text NOT NULL, request_hash text NOT NULL, response jsonb NOT NULL,
 PRIMARY KEY (organization_id,dossier_id,period_id,actor_id,idempotency_key),
 FOREIGN KEY (dossier_id,organization_id) REFERENCES dossiers(id,organization_id) ON DELETE RESTRICT
);
CREATE FUNCTION probant_hr_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'HR_APPEND_ONLY'; END;
$$;
CREATE TRIGGER hr_imports_immutable BEFORE UPDATE OR DELETE ON hr_imports FOR EACH ROW EXECUTE FUNCTION probant_hr_immutable();
CREATE TRIGGER hr_approvals_immutable BEFORE UPDATE OR DELETE ON hr_import_approvals FOR EACH ROW EXECUTE FUNCTION probant_hr_immutable();
CREATE TRIGGER hr_versions_immutable BEFORE UPDATE OR DELETE ON hr_workpaper_versions FOR EACH ROW EXECUTE FUNCTION probant_hr_immutable();
CREATE TRIGGER hr_receipts_immutable BEFORE UPDATE OR DELETE ON hr_command_receipts FOR EACH ROW EXECUTE FUNCTION probant_hr_immutable();


CREATE TABLE IF NOT EXISTS hr_runtime (organization_id uuid NOT NULL, dossier_id uuid NOT NULL, period_id text NOT NULL, archive jsonb NOT NULL, PRIMARY KEY(organization_id,dossier_id,period_id), FOREIGN KEY(dossier_id,organization_id) REFERENCES dossiers(id,organization_id) ON DELETE RESTRICT);



COMMIT;
