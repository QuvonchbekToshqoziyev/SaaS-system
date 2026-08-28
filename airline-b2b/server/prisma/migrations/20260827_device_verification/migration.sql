CREATE TABLE IF NOT EXISTS "TrustedDevice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "sessionVersion" INTEGER NOT NULL,
  "name" TEXT,
  "userAgent" TEXT,
  "lastIp" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LoginVerificationChallenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "emailDelivered" BOOLEAN NOT NULL DEFAULT false,
  "telegramDelivered" BOOLEAN NOT NULL DEFAULT false,
  "qaDelivery" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "requestIp" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoginVerificationChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TrustedDevice_userId_revokedAt_expiresAt_idx"
  ON "TrustedDevice"("userId", "revokedAt", "expiresAt");
CREATE INDEX IF NOT EXISTS "TrustedDevice_expiresAt_idx"
  ON "TrustedDevice"("expiresAt");
CREATE INDEX IF NOT EXISTS "LoginVerificationChallenge_userId_consumedAt_expiresAt_idx"
  ON "LoginVerificationChallenge"("userId", "consumedAt", "expiresAt");
CREATE INDEX IF NOT EXISTS "LoginVerificationChallenge_expiresAt_idx"
  ON "LoginVerificationChallenge"("expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrustedDevice_userId_fkey') THEN
    ALTER TABLE "TrustedDevice"
      ADD CONSTRAINT "TrustedDevice_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LoginVerificationChallenge_userId_fkey') THEN
    ALTER TABLE "LoginVerificationChallenge"
      ADD CONSTRAINT "LoginVerificationChallenge_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
