-- Migration: replace `date` with `startDate`/`endDate`, expand location fields
--
-- 1. Add new nullable columns first
-- 2. Backfill from existing `date` column
-- 3. Add NOT NULL constraints
-- 4. Drop `date` and old index
-- 5. Widen `location` from VarChar(300) to Text
-- 6. Create new index on `startDate`

-- Step 1: Add new columns (nullable to allow backfill)
ALTER TABLE "Event" ADD COLUMN "startDate" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN "endDate"   TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN "country"   VARCHAR(100);
ALTER TABLE "Event" ADD COLUMN "city"      VARCHAR(200);
ALTER TABLE "Event" ADD COLUMN "latitude"  DOUBLE PRECISION;
ALTER TABLE "Event" ADD COLUMN "longitude" DOUBLE PRECISION;

-- Step 2: Backfill start/end from existing date (end = start + 2 hours)
UPDATE "Event" SET
  "startDate" = "date",
  "endDate"   = "date" + INTERVAL '2 hours';

-- Step 3: Apply NOT NULL constraints
ALTER TABLE "Event" ALTER COLUMN "startDate" SET NOT NULL;
ALTER TABLE "Event" ALTER COLUMN "endDate"   SET NOT NULL;

-- Step 4: Drop the old `date` column and its index
DROP INDEX IF EXISTS "Event_date_idx";
ALTER TABLE "Event" DROP COLUMN "date";

-- Step 5: Widen location from VARCHAR(300) to TEXT
ALTER TABLE "Event" ALTER COLUMN "location" TYPE TEXT;

-- Step 6: New index on startDate
CREATE INDEX "Event_startDate_idx" ON "Event"("startDate");
