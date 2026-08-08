-- Add session-family metadata used for atomic refresh rotation and replay detection.
ALTER TABLE "Session"
ADD COLUMN "familyId" UUID,
ADD COLUMN "rotatedFromId" UUID,
ADD COLUMN "compromisedAt" TIMESTAMP(3),
ADD COLUMN "lastUsedAt" TIMESTAMP(3);

-- Existing sessions each begin as the root of their own token family.
UPDATE "Session" SET "familyId" = "id" WHERE "familyId" IS NULL;
ALTER TABLE "Session" ALTER COLUMN "familyId" SET NOT NULL;

CREATE UNIQUE INDEX "Session_rotatedFromId_key" ON "Session"("rotatedFromId");
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");
CREATE INDEX "Session_familyId_idx" ON "Session"("familyId");

ALTER TABLE "Session"
ADD CONSTRAINT "Session_rotatedFromId_fkey"
FOREIGN KEY ("rotatedFromId") REFERENCES "Session"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
