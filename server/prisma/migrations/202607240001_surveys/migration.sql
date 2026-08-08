CREATE TABLE "Survey" (
  "id" UUID NOT NULL, "universityId" UUID, "createdById" UUID NOT NULL,
  "title" TEXT NOT NULL, "description" TEXT NOT NULL, "questions" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PUBLISHED', "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Survey_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Survey_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE SET NULL,
  CONSTRAINT "Survey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE TABLE "SurveyResponse" (
  "id" UUID NOT NULL, "surveyId" UUID NOT NULL, "userId" UUID NOT NULL,
  "answers" JSONB NOT NULL, "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE,
  CONSTRAINT "SurveyResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX "Survey_universityId_idx" ON "Survey"("universityId");
CREATE INDEX "Survey_createdById_idx" ON "Survey"("createdById");
CREATE INDEX "Survey_status_publishedAt_idx" ON "Survey"("status", "publishedAt");
CREATE UNIQUE INDEX "SurveyResponse_surveyId_userId_key" ON "SurveyResponse"("surveyId", "userId");
CREATE INDEX "SurveyResponse_surveyId_idx" ON "SurveyResponse"("surveyId");
CREATE INDEX "SurveyResponse_userId_idx" ON "SurveyResponse"("userId");
