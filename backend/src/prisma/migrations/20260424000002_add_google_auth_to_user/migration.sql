-- Migration: add Google OAuth fields to User, make shieldedAddress optional
-- Users are now identified by googleId/email; shieldedAddress can be linked later.

-- Add new columns (all nullable so existing rows are unaffected)
ALTER TABLE "User"
  ADD COLUMN "googleId" VARCHAR(200),
  ADD COLUMN "email"    VARCHAR(200),
  ADD COLUMN "name"     VARCHAR(200);

-- Make shieldedAddress optional (was NOT NULL)
ALTER TABLE "User"
  ALTER COLUMN "shieldedAddress" DROP NOT NULL;

-- Unique constraints for new identity fields
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
CREATE UNIQUE INDEX "User_email_key"    ON "User"("email");

-- Index for googleId lookups
CREATE INDEX "User_googleId_idx" ON "User"("googleId");
