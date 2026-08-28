ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Employee"
  ADD COLUMN IF NOT EXISTS "loginUserId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Employee_loginUserId_key"
  ON "Employee"("loginUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Employee_loginUserId_fkey'
  ) THEN
    ALTER TABLE "Employee"
      ADD CONSTRAINT "Employee_loginUserId_fkey"
      FOREIGN KEY ("loginUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
