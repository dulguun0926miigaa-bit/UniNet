-- Add explicit survey visibility so read/submit authorization can follow
-- PRIVATE / PARTNERS / NETWORK / PUBLIC tenant-sharing rules.
ALTER TABLE "Survey"
ADD COLUMN "visibility" "ContentVisibility" NOT NULL DEFAULT 'PRIVATE';

-- Legacy network surveys were represented by a null university. Preserve their
-- previous reach while all university-owned surveys remain private by default.
UPDATE "Survey"
SET "visibility" = 'NETWORK'
WHERE "universityId" IS NULL;

DROP INDEX IF EXISTS "Survey_status_publishedAt_idx";
CREATE INDEX "Survey_status_visibility_publishedAt_idx"
ON "Survey"("status", "visibility", "publishedAt");
CREATE INDEX "Survey_universityId_status_visibility_idx"
ON "Survey"("universityId", "status", "visibility");
