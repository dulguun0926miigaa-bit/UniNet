-- Phase 5M: Resend OTP password recovery, remembered sessions and paid event checkout.
ALTER TYPE "RegistrationStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_PENDING' BEFORE 'CONFIRMED';

CREATE TYPE "EventPricingType" AS ENUM ('FREE', 'PAID');
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELED', 'REFUNDED');

ALTER TABLE "Session" ADD COLUMN "remembered" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Content"
  ADD COLUMN "pricingType" "EventPricingType" NOT NULL DEFAULT 'FREE',
  ADD COLUMN "priceAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'MNT';

CREATE TABLE "PasswordResetOtpChallenge" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "challengeTokenHash" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetOtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetOtpChallenge_challengeTokenHash_key" ON "PasswordResetOtpChallenge"("challengeTokenHash");
CREATE INDEX "PasswordResetOtpChallenge_userId_usedAt_createdAt_idx" ON "PasswordResetOtpChallenge"("userId", "usedAt", "createdAt");
CREATE INDEX "PasswordResetOtpChallenge_expiresAt_idx" ON "PasswordResetOtpChallenge"("expiresAt");
ALTER TABLE "PasswordResetOtpChallenge" ADD CONSTRAINT "PasswordResetOtpChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Payment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "contentId" UUID NOT NULL,
  "registrationId" UUID NOT NULL,
  "provider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE',
  "providerSessionId" TEXT,
  "providerPaymentId" TEXT,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'MNT',
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "paidAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Payment_registrationId_key" ON "Payment"("registrationId");
CREATE UNIQUE INDEX "Payment_providerSessionId_key" ON "Payment"("providerSessionId");
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");
CREATE INDEX "Payment_userId_status_idx" ON "Payment"("userId", "status");
CREATE INDEX "Payment_contentId_status_idx" ON "Payment"("contentId", "status");
CREATE INDEX "Payment_provider_status_idx" ON "Payment"("provider", "status");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "EventRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Content" ADD CONSTRAINT "Content_event_pricing_check" CHECK (
  ("type" = 'EVENT' AND (("pricingType" = 'FREE' AND "priceAmount" = 0) OR ("pricingType" = 'PAID' AND "priceAmount" > 0)))
  OR ("type" <> 'EVENT' AND "pricingType" = 'FREE' AND "priceAmount" = 0)
);
