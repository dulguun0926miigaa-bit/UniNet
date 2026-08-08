-- Phase 3: store the student enrollment year separately from graduation year.
ALTER TABLE "StudentProfile"
ADD COLUMN "enrollmentYear" INTEGER;

ALTER TABLE "StudentProfile"
ADD CONSTRAINT "StudentProfile_enrollmentYear_check"
CHECK ("enrollmentYear" IS NULL OR ("enrollmentYear" >= 1950 AND "enrollmentYear" <= 2100));
