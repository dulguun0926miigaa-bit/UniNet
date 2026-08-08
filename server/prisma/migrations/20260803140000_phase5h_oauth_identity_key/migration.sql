ALTER TABLE "User" ADD COLUMN "googleIssuer" TEXT;

UPDATE "User"
SET "googleIssuer" = 'https://accounts.google.com'
WHERE "googleId" IS NOT NULL AND "googleIssuer" IS NULL;

CREATE UNIQUE INDEX "User_googleIssuer_googleId_key" ON "User"("googleIssuer", "googleId");
