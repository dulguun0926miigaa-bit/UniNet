-- Phase 5F: Google identity linking and editable university profiles.
ALTER TABLE "User"
  ADD COLUMN "googleId" TEXT,
  ADD COLUMN "gmail" TEXT,
  ADD COLUMN "studentEmail" TEXT,
  ADD COLUMN "authProvider" TEXT NOT NULL DEFAULT 'PASSWORD',
  ADD COLUMN "googleLinkedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
CREATE UNIQUE INDEX "User_studentEmail_key" ON "User"("studentEmail");

ALTER TABLE "University"
  ADD COLUMN "websiteUrl" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "contactPhone" TEXT,
  ADD COLUMN "primaryColor" TEXT,
  ADD COLUMN "secondaryColor" TEXT,
  ADD COLUMN "rectorName" TEXT,
  ADD COLUMN "establishedYear" INTEGER,
  ADD COLUMN "profileSettings" JSONB;
