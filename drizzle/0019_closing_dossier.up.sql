BEGIN;
-- Mission 19: professional file (work programme, traceable manual work, closing view). Append-only journal, piece originals, idempotency receipts.
-- The file only reads the cycle sheets (cash_, clients_, fa_, eq_, fx_, st_, pv_ heads and versions); it never writes to them.
CREATE UNIQUE INDEX IF NOT EXISTS clients_dossier_org_uq ON dossiers (id, organization_id);
CREATE TABLE IF NOT EXISTS cl_events (
 organization_id uuid NOT NULL, dossier_id uuid NOT NULL, period_id text NOT NULL,
 seq integer NOT NULL CHECK (seq > 0), id text NOT NULL, type text NOT NULL, actor_id text NOT NULL,
 -- Server ISO time kept as written: the local hash chain covers this exact text.
 at text NOT NULL CHECK (at ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'),
 payload jsonb NOT NULL, prev_hash text NOT NULL CHECK (prev_hash ~ '^[a-f0-9]{64}$'), hash text NOT NULL CHECK (hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY (organization_id,dossier_id,period_id,seq),
 UNIQUE (organization_id,dossier_id,period_id,id),
 FOREIGN KEY (dossier_id,organization_id) REFERENCES dossiers(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS cl_pieces (
 organization_id uuid NOT NULL, dossier_id uuid NOT NULL, period_id text NOT NULL, piece_version_id text NOT NULL,
 sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'), original_base64 text NOT NULL,
 CHECK (octet_length(decode(original_base64,'base64')) BETWEEN 1 AND 3145728),
 PRIMARY KEY (organization_id,dossier_id,period_id,piece_version_id),
 FOREIGN KEY (dossier_id,organization_id) REFERENCES dossiers(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS cl_command_receipts (
 organization_id uuid NOT NULL, dossier_id uuid NOT NULL, period_id text NOT NULL, actor_id text NOT NULL,
 idempotency_key text NOT NULL, request_hash text NOT NULL, response jsonb NOT NULL,
 PRIMARY KEY (organization_id,dossier_id,period_id,actor_id,idempotency_key),
 FOREIGN KEY (dossier_id,organization_id) REFERENCES dossiers(id,organization_id) ON DELETE RESTRICT
);
CREATE FUNCTION probant_cl_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'CL_APPEND_ONLY'; END;
$$;
CREATE TRIGGER cl_events_immutable BEFORE UPDATE OR DELETE ON cl_events FOR EACH ROW EXECUTE FUNCTION probant_cl_immutable();
CREATE TRIGGER cl_pieces_immutable BEFORE UPDATE OR DELETE ON cl_pieces FOR EACH ROW EXECUTE FUNCTION probant_cl_immutable();
CREATE TRIGGER cl_receipts_immutable BEFORE UPDATE OR DELETE ON cl_command_receipts FOR EACH ROW EXECUTE FUNCTION probant_cl_immutable();
COMMIT;
