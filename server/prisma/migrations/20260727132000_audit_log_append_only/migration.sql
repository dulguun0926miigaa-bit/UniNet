-- Audit records are evidentiary data. Application code only inserts them, but
-- this trigger also prevents accidental or compromised database clients from
-- modifying/removing a previously written record.
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only; % is forbidden', TG_OP
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER audit_log_append_only
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_mutation();
