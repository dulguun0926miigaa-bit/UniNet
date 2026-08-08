-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('EVENT', 'INTERNSHIP', 'JOB', 'RESEARCH', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "ContentVisibility" AS ENUM ('PRIVATE', 'NETWORK', 'PARTNERS', 'PUBLIC');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'CHANGES_REQUESTED', 'REJECTED', 'ARCHIVED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('CONFIRMED', 'WAITLISTED', 'CANCELLED', 'ATTENDED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PartnershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'ENDED');

-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('INFO', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED');

-- DropForeignKey
ALTER TABLE "Survey" DROP CONSTRAINT "Survey_createdById_fkey";

-- DropForeignKey
ALTER TABLE "Survey" DROP CONSTRAINT "Survey_universityId_fkey";

-- DropForeignKey
ALTER TABLE "SurveyResponse" DROP CONSTRAINT "SurveyResponse_surveyId_fkey";

-- DropForeignKey
ALTER TABLE "SurveyResponse" DROP CONSTRAINT "SurveyResponse_userId_fkey";

-- DropForeignKey
ALTER TABLE "UniversityMember" DROP CONSTRAINT "UniversityMember_importedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "UniversityMember" DROP CONSTRAINT "UniversityMember_universityId_fkey";

-- CreateTable
CREATE TABLE "Content" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "universityId" UUID,
    "createdById" UUID,
    "approvedById" UUID,
    "type" "ContentType" NOT NULL,
    "visibility" "ContentVisibility" NOT NULL DEFAULT 'PRIVATE',
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "organization" TEXT,
    "location" TEXT,
    "mode" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "capacity" INTEGER,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "engagementCount" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB,
    "publishedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedContent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRegistration" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "registrationCode" TEXT NOT NULL,
    "waitlistPosition" INTEGER,
    "consentGranted" BOOLEAN NOT NULL DEFAULT true,
    "attendedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "cvUrl" TEXT,
    "coverNote" TEXT,
    "consentGranted" BOOLEAN NOT NULL DEFAULT true,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "universityId" UUID,
    "contentId" UUID,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actionUrl" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "security" JSONB,
    "notifications" JSONB,
    "privacy" JSONB,
    "appearance" JSONB,
    "locale" JSONB,
    "accessibility" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "recipientUniversityId" UUID,
    "recipientName" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "dataFields" JSONB NOT NULL,
    "action" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partnership" (
    "id" UUID NOT NULL,
    "requesterUniversityId" UUID NOT NULL,
    "partnerUniversityId" UUID NOT NULL,
    "requestedByUserId" UUID,
    "status" "PartnershipStatus" NOT NULL DEFAULT 'PENDING',
    "sharedContentCount" INTEGER NOT NULL DEFAULT 0,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Partnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "universityId" UUID,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "resourceName" TEXT,
    "previousData" JSONB,
    "nextData" JSONB,
    "severity" "AuditSeverity" NOT NULL DEFAULT 'INFO',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Content_slug_key" ON "Content"("slug");

-- CreateIndex
CREATE INDEX "Content_universityId_status_idx" ON "Content"("universityId", "status");

-- CreateIndex
CREATE INDEX "Content_type_status_publishedAt_idx" ON "Content"("type", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "Content_visibility_status_idx" ON "Content"("visibility", "status");

-- CreateIndex
CREATE INDEX "Content_createdById_idx" ON "Content"("createdById");

-- CreateIndex
CREATE INDEX "Content_deadlineAt_idx" ON "Content"("deadlineAt");

-- CreateIndex
CREATE INDEX "SavedContent_contentId_idx" ON "SavedContent"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedContent_userId_contentId_key" ON "SavedContent"("userId", "contentId");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_registrationCode_key" ON "EventRegistration"("registrationCode");

-- CreateIndex
CREATE INDEX "EventRegistration_contentId_status_idx" ON "EventRegistration"("contentId", "status");

-- CreateIndex
CREATE INDEX "EventRegistration_userId_status_idx" ON "EventRegistration"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_userId_contentId_key" ON "EventRegistration"("userId", "contentId");

-- CreateIndex
CREATE INDEX "Application_contentId_status_idx" ON "Application"("contentId", "status");

-- CreateIndex
CREATE INDEX "Application_userId_status_idx" ON "Application"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Application_userId_contentId_key" ON "Application"("userId", "contentId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_universityId_idx" ON "Notification"("universityId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_grantedAt_idx" ON "ConsentRecord"("userId", "grantedAt");

-- CreateIndex
CREATE INDEX "ConsentRecord_recipientUniversityId_idx" ON "ConsentRecord"("recipientUniversityId");

-- CreateIndex
CREATE INDEX "Partnership_partnerUniversityId_status_idx" ON "Partnership"("partnerUniversityId", "status");

-- CreateIndex
CREATE INDEX "Partnership_requestedByUserId_idx" ON "Partnership"("requestedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Partnership_requesterUniversityId_partnerUniversityId_key" ON "Partnership"("requesterUniversityId", "partnerUniversityId");

-- CreateIndex
CREATE INDEX "AuditLog_universityId_createdAt_idx" ON "AuditLog"("universityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Feedback_userId_createdAt_idx" ON "Feedback"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "UniversityMember" ADD CONSTRAINT "UniversityMember_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversityMember" ADD CONSTRAINT "UniversityMember_importedByUserId_fkey" FOREIGN KEY ("importedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedContent" ADD CONSTRAINT "SavedContent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedContent" ADD CONSTRAINT "SavedContent_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_recipientUniversityId_fkey" FOREIGN KEY ("recipientUniversityId") REFERENCES "University"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partnership" ADD CONSTRAINT "Partnership_requesterUniversityId_fkey" FOREIGN KEY ("requesterUniversityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partnership" ADD CONSTRAINT "Partnership_partnerUniversityId_fkey" FOREIGN KEY ("partnerUniversityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partnership" ADD CONSTRAINT "Partnership_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
