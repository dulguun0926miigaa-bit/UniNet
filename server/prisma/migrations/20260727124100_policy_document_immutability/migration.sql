-- Published policy bodies are audit evidence. Retiring a document is allowed,
-- but its identity, content, checksum and effective dates must never be edited.
CREATE OR REPLACE FUNCTION "protect_published_policy_document"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."publishedAt" <= CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'Published policy documents cannot be deleted; retire and version them instead.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD."publishedAt" <= CURRENT_TIMESTAMP
    AND (
      NEW."type" IS DISTINCT FROM OLD."type"
      OR NEW."version" IS DISTINCT FROM OLD."version"
      OR NEW."locale" IS DISTINCT FROM OLD."locale"
      OR NEW."title" IS DISTINCT FROM OLD."title"
      OR NEW."content" IS DISTINCT FROM OLD."content"
      OR NEW."checksum" IS DISTINCT FROM OLD."checksum"
      OR NEW."required" IS DISTINCT FROM OLD."required"
      OR NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt"
      OR NEW."effectiveAt" IS DISTINCT FROM OLD."effectiveAt"
    )
  THEN
    RAISE EXCEPTION 'Published policy documents are immutable; publish a new version instead.'
      USING ERRCODE = '23514';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PolicyDocument_published_immutable"
BEFORE UPDATE OR DELETE ON "PolicyDocument"
FOR EACH ROW EXECUTE FUNCTION "protect_published_policy_document"();
