-- Secure, tenant-scoped file metadata. Binary data remains in object storage.
CREATE TYPE "FilePurpose" AS ENUM ('STUDENT_CV', 'PROFILE_AVATAR', 'ATTACHMENT');
CREATE TYPE "FileAssetStatus" AS ENUM ('QUARANTINED', 'AVAILABLE', 'DELETED');
CREATE TYPE "MalwareScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'ERROR');

CREATE TABLE "FileAsset" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "universityId" UUID,
    "purpose" "FilePurpose" NOT NULL,
    "status" "FileAssetStatus" NOT NULL DEFAULT 'QUARANTINED',
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "detectedMime" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "scanStatus" "MalwareScanStatus" NOT NULL DEFAULT 'PENDING',
    "scanProvider" TEXT,
    "scanResult" TEXT,
    "scannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StudentProfile" ADD COLUMN "avatarAssetId" UUID;
ALTER TABLE "StudentProfile" ADD COLUMN "cvAssetId" UUID;
ALTER TABLE "Application" ADD COLUMN "cvAssetId" UUID;

CREATE UNIQUE INDEX "FileAsset_storageKey_key" ON "FileAsset"("storageKey");
CREATE INDEX "FileAsset_ownerId_purpose_status_createdAt_idx" ON "FileAsset"("ownerId", "purpose", "status", "createdAt");
CREATE INDEX "FileAsset_universityId_purpose_status_idx" ON "FileAsset"("universityId", "purpose", "status");
CREATE INDEX "FileAsset_sha256_idx" ON "FileAsset"("sha256");
CREATE INDEX "FileAsset_scanStatus_createdAt_idx" ON "FileAsset"("scanStatus", "createdAt");
CREATE UNIQUE INDEX "StudentProfile_avatarAssetId_key" ON "StudentProfile"("avatarAssetId");
CREATE UNIQUE INDEX "StudentProfile_cvAssetId_key" ON "StudentProfile"("cvAssetId");
CREATE INDEX "Application_cvAssetId_idx" ON "Application"("cvAssetId");

ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_avatarAssetId_fkey" FOREIGN KEY ("avatarAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_cvAssetId_fkey" FOREIGN KEY ("cvAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_cvAssetId_fkey" FOREIGN KEY ("cvAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
