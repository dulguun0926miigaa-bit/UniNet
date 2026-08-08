CREATE TYPE "DomainVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'FAILED', 'REVOKED');
CREATE TYPE "DomainVerificationMethod" AS ENUM ('ADMIN_APPROVAL', 'DNS_TXT', 'EMAIL');
CREATE TYPE "RosterImportStatus" AS ENUM ('PREVIEWED', 'COMMITTING', 'COMMITTED', 'FAILED');

ALTER TABLE "UniversityDomain"
  ADD COLUMN "verificationStatus" "DomainVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "verificationMethod" "DomainVerificationMethod",
  ADD COLUMN "verificationChallenge" TEXT,
  ADD COLUMN "verificationEvidence" TEXT,
  ADD COLUMN "verificationRequestedAt" TIMESTAMP(3),
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "verifiedByUserId" UUID;

UPDATE "UniversityDomain"
SET "verificationStatus" = 'VERIFIED', "verifiedAt" = COALESCE("updatedAt", "createdAt")
WHERE "isVerified" = true;

CREATE INDEX "UniversityDomain_universityId_isActive_verificationStatus_idx"
  ON "UniversityDomain"("universityId", "isActive", "verificationStatus");

CREATE TABLE "RosterImportJob" (
  "id" UUID NOT NULL,
  "universityId" UUID NOT NULL,
  "uploadedById" UUID NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileSha256" TEXT NOT NULL,
  "status" "RosterImportStatus" NOT NULL DEFAULT 'PREVIEWED',
  "validatedRows" JSONB NOT NULL,
  "totalRows" INTEGER NOT NULL,
  "validRows" INTEGER NOT NULL,
  "invalidRows" INTEGER NOT NULL,
  "insertedRows" INTEGER NOT NULL DEFAULT 0,
  "updatedRows" INTEGER NOT NULL DEFAULT 0,
  "skippedRows" INTEGER NOT NULL DEFAULT 0,
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "committedAt" TIMESTAMP(3),
  CONSTRAINT "RosterImportJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RosterImportRowError" (
  "id" UUID NOT NULL,
  "importJobId" UUID NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "field" TEXT,
  "code" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "rowFingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RosterImportRowError_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "UniversityMember" ADD COLUMN "importJobId" UUID;

CREATE INDEX "RosterImportJob_universityId_createdAt_idx" ON "RosterImportJob"("universityId", "createdAt");
CREATE INDEX "RosterImportJob_uploadedById_createdAt_idx" ON "RosterImportJob"("uploadedById", "createdAt");
CREATE INDEX "RosterImportJob_status_createdAt_idx" ON "RosterImportJob"("status", "createdAt");
CREATE UNIQUE INDEX "RosterImportJob_universityId_fileSha256_uploadedById_createdAt_key" ON "RosterImportJob"("universityId", "fileSha256", "uploadedById", "createdAt");
CREATE INDEX "RosterImportRowError_importJobId_rowNumber_idx" ON "RosterImportRowError"("importJobId", "rowNumber");
CREATE INDEX "RosterImportRowError_code_idx" ON "RosterImportRowError"("code");
CREATE INDEX "UniversityMember_importJobId_idx" ON "UniversityMember"("importJobId");

ALTER TABLE "RosterImportJob"
  ADD CONSTRAINT "RosterImportJob_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RosterImportJob_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RosterImportRowError"
  ADD CONSTRAINT "RosterImportRowError_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "RosterImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UniversityMember"
  ADD CONSTRAINT "UniversityMember_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "RosterImportJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
