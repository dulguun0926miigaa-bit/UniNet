-- Persist account-level preferences that do not belong to a role-specific profile.
ALTER TABLE "UserSettings"
ADD COLUMN "account" JSONB;
