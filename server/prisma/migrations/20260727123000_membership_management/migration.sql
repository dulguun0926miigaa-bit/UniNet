-- Invitation records contain only a SHA-256 token digest. The one-time token is
-- delivered to the recipient and cannot be recovered from the database.
CREATE TABLE "UniversityInvitation" (
    "id" UUID NOT NULL,
    "universityId" UUID NOT NULL,
    "invitedById" UUID NOT NULL,
    "acceptedUserId" UUID,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "employeeCode" TEXT,
    "department" TEXT,
    "jobTitle" TEXT,
    "permissions" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniversityInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UniversityInvitation_acceptedUserId_key" ON "UniversityInvitation"("acceptedUserId");
CREATE UNIQUE INDEX "UniversityInvitation_tokenHash_key" ON "UniversityInvitation"("tokenHash");
CREATE INDEX "UniversityInvitation_universityId_normalizedEmail_role_idx" ON "UniversityInvitation"("universityId", "normalizedEmail", "role");
CREATE INDEX "UniversityInvitation_universityId_createdAt_idx" ON "UniversityInvitation"("universityId", "createdAt");
CREATE INDEX "UniversityInvitation_expiresAt_idx" ON "UniversityInvitation"("expiresAt");

ALTER TABLE "UniversityInvitation"
ADD CONSTRAINT "UniversityInvitation_universityId_fkey"
FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UniversityInvitation"
ADD CONSTRAINT "UniversityInvitation_invitedById_fkey"
FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UniversityInvitation"
ADD CONSTRAINT "UniversityInvitation_acceptedUserId_fkey"
FOREIGN KEY ("acceptedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
