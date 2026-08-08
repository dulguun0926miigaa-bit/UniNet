-- Phase 5J: direct Student activation and University logo uploads.
ALTER TYPE "FilePurpose" ADD VALUE IF NOT EXISTS 'UNIVERSITY_LOGO';

UPDATE "User"
SET "status" = 'ACTIVE', "updatedAt" = CURRENT_TIMESTAMP
WHERE "role" = 'STUDENT' AND "status" = 'PENDING_REVIEW' AND "emailVerifiedAt" IS NOT NULL;
