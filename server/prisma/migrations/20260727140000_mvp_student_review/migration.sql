-- Link an approved student profile to the roster record used for the decision.
ALTER TABLE "StudentProfile" ADD COLUMN "rosterMemberId" UUID;

CREATE UNIQUE INDEX "StudentProfile_rosterMemberId_key" ON "StudentProfile"("rosterMemberId");

ALTER TABLE "StudentProfile"
ADD CONSTRAINT "StudentProfile_rosterMemberId_fkey"
FOREIGN KEY ("rosterMemberId") REFERENCES "UniversityMember"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
