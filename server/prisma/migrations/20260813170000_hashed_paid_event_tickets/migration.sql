-- Persist only a one-way hash of each issued paid-event QR token.
ALTER TABLE "EventRegistration"
  ADD COLUMN "ticketTokenHash" TEXT,
  ADD COLUMN "ticketIssuedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "EventRegistration_ticketTokenHash_key" ON "EventRegistration"("ticketTokenHash");
