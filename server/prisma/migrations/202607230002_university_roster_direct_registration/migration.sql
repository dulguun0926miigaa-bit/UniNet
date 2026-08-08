-- Add roster/domain support while keeping registration immediately active.
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'PENDING_REVIEW';
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

CREATE TYPE "UniversityMemberType" AS ENUM ('STUDENT', 'STAFF', 'UNIVERSITY_ADMIN');
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'GRADUATED', 'SUSPENDED', 'WITHDRAWN', 'UNKNOWN');

ALTER TABLE "UniversityDomain"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "UniversityDomain" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "UniversityDomain" ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "User" ADD COLUMN "normalizedEmail" TEXT;
UPDATE "User" SET "normalizedEmail" = lower(trim("email"));
ALTER TABLE "User" ALTER COLUMN "normalizedEmail" SET NOT NULL;
CREATE UNIQUE INDEX "User_normalizedEmail_key" ON "User"("normalizedEmail");

ALTER TABLE "StudentProfile" ALTER COLUMN "universityId" DROP NOT NULL;

CREATE TABLE "UniversityMember" (
  "id" UUID NOT NULL,
  "universityId" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "normalizedEmail" TEXT NOT NULL,
  "studentId" TEXT,
  "employeeCode" TEXT,
  "firstName" TEXT,
  "lastName" TEXT,
  "memberType" "UniversityMemberType" NOT NULL,
  "enrollmentStatus" "EnrollmentStatus" NOT NULL DEFAULT 'UNKNOWN',
  "department" TEXT,
  "major" TEXT,
  "graduationYear" INTEGER,
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "importedByUserId" UUID,
  CONSTRAINT "UniversityMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UniversityMember_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE,
  CONSTRAINT "UniversityMember_importedByUserId_fkey" FOREIGN KEY ("importedByUserId") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "UniversityMember_universityId_normalizedEmail_key" ON "UniversityMember"("universityId", "normalizedEmail");
CREATE UNIQUE INDEX "UniversityMember_universityId_studentId_key" ON "UniversityMember"("universityId", "studentId");
CREATE UNIQUE INDEX "UniversityMember_universityId_employeeCode_key" ON "UniversityMember"("universityId", "employeeCode");
CREATE INDEX "UniversityMember_universityId_idx" ON "UniversityMember"("universityId");
CREATE INDEX "UniversityMember_normalizedEmail_idx" ON "UniversityMember"("normalizedEmail");
CREATE INDEX "UniversityMember_memberType_idx" ON "UniversityMember"("memberType");
CREATE INDEX "UniversityMember_enrollmentStatus_idx" ON "UniversityMember"("enrollmentStatus");
CREATE INDEX "UniversityMember_universityId_enrollmentStatus_idx" ON "UniversityMember"("universityId", "enrollmentStatus");
