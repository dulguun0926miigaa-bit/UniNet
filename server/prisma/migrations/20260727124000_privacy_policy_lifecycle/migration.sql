CREATE TYPE "PolicyType" AS ENUM ('TERMS_OF_SERVICE', 'PRIVACY_POLICY');
CREATE TYPE "AccountActionType" AS ENUM ('DEACTIVATE', 'DELETE');
CREATE TYPE "AccountActionStatus" AS ENUM ('REQUESTED', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'REJECTED');

ALTER TABLE "User"
ADD COLUMN "deactivatedAt" TIMESTAMP(3),
ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN "deletionScheduledFor" TIMESTAMP(3),
ADD COLUMN "legalHoldUntil" TIMESTAMP(3),
ADD COLUMN "legalHoldReason" TEXT;

ALTER TABLE "ConsentRecord"
ADD COLUMN "resourceType" TEXT,
ADD COLUMN "resourceId" UUID,
ADD COLUMN "supersedesId" UUID,
ADD COLUMN "context" JSONB,
ADD COLUMN "revokedReason" TEXT;

CREATE TABLE "PolicyDocument" (
    "id" UUID NOT NULL,
    "type" "PolicyType" NOT NULL,
    "version" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'mn',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PolicyAcceptance" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "policyDocumentId" UUID NOT NULL,
    "policyType" "PolicyType" NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "documentChecksum" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'WEB',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "context" JSONB,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountActionRequest" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "AccountActionType" NOT NULL,
    "status" "AccountActionStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledFor" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "legalHoldUntil" TIMESTAMP(3),
    "legalHoldReason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "context" JSONB,

    CONSTRAINT "AccountActionRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsentRecord_supersedesId_key" ON "ConsentRecord"("supersedesId");
CREATE INDEX "ConsentRecord_userId_action_revokedAt_idx" ON "ConsentRecord"("userId", "action", "revokedAt");
CREATE INDEX "ConsentRecord_resourceType_resourceId_idx" ON "ConsentRecord"("resourceType", "resourceId");

CREATE UNIQUE INDEX "PolicyDocument_type_version_locale_key" ON "PolicyDocument"("type", "version", "locale");
CREATE INDEX "PolicyDocument_type_locale_effectiveAt_idx" ON "PolicyDocument"("type", "locale", "effectiveAt");
CREATE INDEX "PolicyDocument_required_publishedAt_retiredAt_idx" ON "PolicyDocument"("required", "publishedAt", "retiredAt");

CREATE UNIQUE INDEX "PolicyAcceptance_userId_policyDocumentId_key" ON "PolicyAcceptance"("userId", "policyDocumentId");
CREATE INDEX "PolicyAcceptance_userId_acceptedAt_idx" ON "PolicyAcceptance"("userId", "acceptedAt");
CREATE INDEX "PolicyAcceptance_policyType_policyVersion_idx" ON "PolicyAcceptance"("policyType", "policyVersion");

CREATE INDEX "AccountActionRequest_userId_status_requestedAt_idx" ON "AccountActionRequest"("userId", "status", "requestedAt");
CREATE INDEX "AccountActionRequest_type_status_scheduledFor_idx" ON "AccountActionRequest"("type", "status", "scheduledFor");

ALTER TABLE "ConsentRecord"
ADD CONSTRAINT "ConsentRecord_supersedesId_fkey"
FOREIGN KEY ("supersedesId") REFERENCES "ConsentRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PolicyAcceptance"
ADD CONSTRAINT "PolicyAcceptance_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PolicyAcceptance"
ADD CONSTRAINT "PolicyAcceptance_policyDocumentId_fkey"
FOREIGN KEY ("policyDocumentId") REFERENCES "PolicyDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountActionRequest"
ADD CONSTRAINT "AccountActionRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Baseline documents make registration acceptance atomic immediately after deploy.
-- A legal review must publish a new immutable version instead of editing these rows.
INSERT INTO "PolicyDocument" (
    "id", "type", "version", "locale", "title", "content", "checksum",
    "required", "publishedAt", "effectiveAt", "updatedAt"
) VALUES
(
    '1f3a2e2e-6a0d-4b32-a41e-b6d1f27ed001',
    'TERMS_OF_SERVICE',
    '1.0.0',
    'mn',
    'UniNet ашиглах нөхцөл',
    'UniNet Terms of Service v1.0. Use an accurate identity, protect your credentials, access only authorized university resources, and follow applicable university rules. UniNet may suspend access used for abuse or unauthorized activity.',
    '12db0bbb8ad3eb3bddb71cc99a8418e49aace0d2a6507aa40c5e55299f34d49a',
    true,
    '2026-07-27 00:00:00.000',
    '2026-07-27 00:00:00.000',
    '2026-07-27 00:00:00.000'
),
(
    '1f3a2e2e-6a0d-4b32-a41e-b6d1f27ed002',
    'PRIVACY_POLICY',
    '1.0.0',
    'mn',
    'UniNet нууцлалын бодлого',
    'UniNet Privacy Policy v1.0. UniNet processes account, university affiliation, activity, application, registration, consent, and security data to provide and protect the service. Sharing with another university requires an explicit purpose and consent or another documented lawful basis.',
    'b4a54b184e9069ca2573823bfc41b5d1e3e928b76324295d6c671a3c2d7f8131',
    true,
    '2026-07-27 00:00:00.000',
    '2026-07-27 00:00:00.000',
    '2026-07-27 00:00:00.000'
);
