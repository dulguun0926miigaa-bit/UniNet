-- Survey lifecycle is explicit so draft/closed/archived states cannot drift as free-form strings.
CREATE TYPE "SurveyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');

ALTER TABLE "Survey"
  ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  ALTER COLUMN "publishedAt" DROP NOT NULL,
  ALTER COLUMN "publishedAt" DROP DEFAULT,
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "SurveyStatus" USING ("status"::"SurveyStatus"),
  ALTER COLUMN "status" SET DEFAULT 'PUBLISHED';

UPDATE "Survey"
SET "publishedAt" = NULL
WHERE "status" = 'DRAFT';

ALTER TABLE "SurveyResponse"
  ADD COLUMN "surveySchemaVersion" INTEGER NOT NULL DEFAULT 1;
