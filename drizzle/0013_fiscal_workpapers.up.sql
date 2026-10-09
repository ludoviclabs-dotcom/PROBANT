BEGIN;
-- Mission 13: dedicated append-only chain for the fiscal sheets (VAT, then IS); the TAX canonical tables are not reused by the workpapers.
CREATE UNIQUE INDEX IF NOT EXISTS clients_dossier_org_uq ON dossiers (id, organization_id);
CREATE TABLE IF NOT EXISTS fx_imports (
 organization_id uuid NOT NULL, dossier_id uuid NOT NULL, period_id text NOT NULL, id text NOT NULL,
 document_type text NOT NULL CHECK (document_type IN ('fx_fec','fx_vat_return','fx_cit_return','fx_invoices','fx_vat_payments','fx_support')),
 preview jsonb NOT NULL, original_base64 text NOT NULL,
 CHECK (octet_length(decode(original_base64,'base64')) BETWEEN 1 AND 10485760),
 PRIMARY KEY (organization_id,dossier_id,period_id,id),
 FOREIGN KEY (dossier_id,organization_id) REFERENCES dossiers(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS fx_import_approvals (
 organization_id uuid NOT NULL, dossier_id uuid NOT NULL, period_id text NOT NULL, import_id text NOT NULL,
 actor_id text NOT NULL, approved_at timestamptz NOT NULL, preview_hash text NOT NULL,
 PRIMARY KEY (organization_id,dossier_id,period_id,import_id),
 FOREIGN KEY (organization_id,dossier_id,period_id,import_id) REFERENCES fx_imports(organization_id,dossier_id,period_id,id)
);
-- One head per tabular source, one VAT return per declarative period and one IS form per form and period.
CREATE TABLE IF NOT EXISTS fx_source_heads (
 organization_id uuid NOT NULL, dossier_id uuid NOT NULL, period_id text NOT NULL,
 document_type text NOT NULL CHECK (document_type IN ('fx_fec','fx_invoices','fx_vat_payments','fx_support') OR document_type ~ '^fx_vat_return:[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR document_type ~ '^fx_cit_return:[0-9A-Z-]{3,20}:[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
 import_id text NOT NULL, PRIMARY KEY (organization_id,dossier_id,period_id,document_type),
 FOREIGN KEY (organization_id,dossier_id,period_id,import_id) REFERENCES fx_imports(organization_id,dossier_id,period_id,id)
);
CREATE TABLE IF NOT EXISTS fx_workpaper_heads (
 organization_id uuid NOT NULL, dossier_id uuid NOT NULL, period_id text NOT NULL, id text NOT NULL,
 version integer NOT NULL CHECK (version > 0), PRIMARY KEY (organization_id,dossier_id,period_id,id),
 FOREIGN KEY (dossier_id,organization_id) REFERENCES dossiers(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS fx_workpaper_versions (
 organization_id uuid NOT NULL, dossier_id uuid NOT NULL, period_id text NOT NULL, id text NOT NULL,
 version integer NOT NULL CHECK (version > 0), run jsonb NOT NULL,
 PRIMARY KEY (organization_id,dossier_id,period_id,id,version),
 FOREIGN KEY (organization_id,dossier_id,period_id,id) REFERENCES fx_workpaper_heads(organization_id,dossier_id,period_id,id)
);
CREATE TABLE IF NOT EXISTS fx_command_receipts (
 organization_id uuid NOT NULL, dossier_id uuid NOT NULL, period_id text NOT NULL, actor_id text NOT NULL,
 idempotency_key text NOT NULL, request_hash text NOT NULL, response jsonb NOT NULL,
 PRIMARY KEY (organization_id,dossier_id,period_id,actor_id,idempotency_key),
 FOREIGN KEY (dossier_id,organization_id) REFERENCES dossiers(id,organization_id) ON DELETE RESTRICT
);
CREATE FUNCTION probant_fx_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'FX_APPEND_ONLY'; END;
$$;
CREATE TRIGGER fx_imports_immutable BEFORE UPDATE OR DELETE ON fx_imports FOR EACH ROW EXECUTE FUNCTION probant_fx_immutable();
CREATE TRIGGER fx_approvals_immutable BEFORE UPDATE OR DELETE ON fx_import_approvals FOR EACH ROW EXECUTE FUNCTION probant_fx_immutable();
CREATE TRIGGER fx_versions_immutable BEFORE UPDATE OR DELETE ON fx_workpaper_versions FOR EACH ROW EXECUTE FUNCTION probant_fx_immutable();
CREATE TRIGGER fx_receipts_immutable BEFORE UPDATE OR DELETE ON fx_command_receipts FOR EACH ROW EXECUTE FUNCTION probant_fx_immutable();
COMMIT;
