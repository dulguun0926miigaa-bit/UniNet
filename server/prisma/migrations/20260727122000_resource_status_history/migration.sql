ALTER TABLE "Content"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "ContentStatusHistory" (
  "id" UUID NOT NULL,
  "contentId" UUID NOT NULL,
  "actorId" UUID,
  "fromStatus" "ContentStatus",
  "toStatus" "ContentStatus" NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApplicationStatusHistory" (
  "id" UUID NOT NULL,
  "applicationId" UUID NOT NULL,
  "actorId" UUID,
  "fromStatus" "ApplicationStatus",
  "toStatus" "ApplicationStatus" NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicationStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentStatusHistory_contentId_createdAt_idx" ON "ContentStatusHistory"("contentId", "createdAt");
CREATE INDEX "ContentStatusHistory_actorId_createdAt_idx" ON "ContentStatusHistory"("actorId", "createdAt");
CREATE INDEX "ApplicationStatusHistory_applicationId_createdAt_idx" ON "ApplicationStatusHistory"("applicationId", "createdAt");
CREATE INDEX "ApplicationStatusHistory_actorId_createdAt_idx" ON "ApplicationStatusHistory"("actorId", "createdAt");

ALTER TABLE "ContentStatusHistory"
  ADD CONSTRAINT "ContentStatusHistory_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ContentStatusHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApplicationStatusHistory"
  ADD CONSTRAINT "ApplicationStatusHistory_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ApplicationStatusHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ContentStatusHistory" ("id", "contentId", "actorId", "fromStatus", "toStatus", "createdAt")
SELECT "id", "id", "createdById", NULL, "status", "createdAt"
FROM "Content";

INSERT INTO "ApplicationStatusHistory" ("id", "applicationId", "actorId", "fromStatus", "toStatus", "createdAt")
SELECT "id", "id", "userId", NULL, "status", "submittedAt"
FROM "Application";
