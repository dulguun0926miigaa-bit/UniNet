ALTER TABLE "Session" ADD COLUMN "mfaVerifiedAt" TIMESTAMP(3);

-- Phase 5I: MFA, generic OAuth identities, password history, login backoff and verified email-change requests.
CREATE TABLE "OAuthAccount" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "providerSubject" TEXT NOT NULL,
  "providerEmail" TEXT,
  "providerEmailVerified" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MfaTotpCredential" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "secretCiphertext" TEXT NOT NULL,
  "secretIv" TEXT NOT NULL,
  "secretTag" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "enabledAt" TIMESTAMP(3),
  "lastUsedStep" BIGINT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MfaTotpCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MfaRecoveryCode" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "codeHash" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PasswordHistory" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoginSecurityState" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "keyHash" TEXT NOT NULL,
  "emailHash" TEXT,
  "ipHash" TEXT,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "blockedUntil" TIMESTAMP(3),
  "lastFailureAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "notifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoginSecurityState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailChangeRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "newEmail" TEXT NOT NULL,
  "newNormalizedEmail" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OAuthAccount_issuer_providerSubject_key" ON "OAuthAccount"("issuer", "providerSubject");
CREATE UNIQUE INDEX "OAuthAccount_userId_provider_key" ON "OAuthAccount"("userId", "provider");
CREATE INDEX "OAuthAccount_userId_linkedAt_idx" ON "OAuthAccount"("userId", "linkedAt");
CREATE INDEX "OAuthAccount_provider_providerEmail_idx" ON "OAuthAccount"("provider", "providerEmail");
CREATE UNIQUE INDEX "MfaTotpCredential_userId_key" ON "MfaTotpCredential"("userId");
CREATE INDEX "MfaTotpCredential_enabledAt_idx" ON "MfaTotpCredential"("enabledAt");
CREATE UNIQUE INDEX "MfaRecoveryCode_codeHash_key" ON "MfaRecoveryCode"("codeHash");
CREATE INDEX "MfaRecoveryCode_userId_usedAt_idx" ON "MfaRecoveryCode"("userId", "usedAt");
CREATE INDEX "PasswordHistory_userId_createdAt_idx" ON "PasswordHistory"("userId", "createdAt");
CREATE UNIQUE INDEX "LoginSecurityState_keyHash_key" ON "LoginSecurityState"("keyHash");
CREATE INDEX "LoginSecurityState_blockedUntil_idx" ON "LoginSecurityState"("blockedUntil");
CREATE INDEX "LoginSecurityState_emailHash_lastFailureAt_idx" ON "LoginSecurityState"("emailHash", "lastFailureAt");
CREATE UNIQUE INDEX "EmailChangeRequest_tokenHash_key" ON "EmailChangeRequest"("tokenHash");
CREATE INDEX "EmailChangeRequest_userId_createdAt_idx" ON "EmailChangeRequest"("userId", "createdAt");
CREATE INDEX "EmailChangeRequest_newNormalizedEmail_verifiedAt_cancelledAt_idx" ON "EmailChangeRequest"("newNormalizedEmail", "verifiedAt", "cancelledAt");
CREATE INDEX "EmailChangeRequest_expiresAt_idx" ON "EmailChangeRequest"("expiresAt");

ALTER TABLE "OAuthAccount" ADD CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MfaTotpCredential" ADD CONSTRAINT "MfaTotpCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PasswordHistory" ADD CONSTRAINT "PasswordHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailChangeRequest" ADD CONSTRAINT "EmailChangeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing Google identities while keeping legacy columns for a compatibility migration window.
INSERT INTO "OAuthAccount" ("userId", "provider", "issuer", "providerSubject", "providerEmail", "providerEmailVerified", "linkedAt", "lastUsedAt", "updatedAt")
SELECT "id", 'GOOGLE', COALESCE("googleIssuer", 'https://accounts.google.com'), "googleId", "gmail", true, COALESCE("googleLinkedAt", CURRENT_TIMESTAMP), "lastLoginAt", CURRENT_TIMESTAMP
FROM "User"
WHERE "googleId" IS NOT NULL
ON CONFLICT ("issuer", "providerSubject") DO NOTHING;
