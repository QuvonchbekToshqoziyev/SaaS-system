CREATE TABLE IF NOT EXISTS "FeatureUsageMonthly" (
  "id" TEXT NOT NULL,
  "month" TIMESTAMP(3) NOT NULL,
  "featureKey" TEXT NOT NULL,
  "featureLabel" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "firmId" TEXT NOT NULL DEFAULT '',
  "actorUserId" TEXT NOT NULL DEFAULT '',
  "actorRole" TEXT NOT NULL DEFAULT '',
  "count" INTEGER NOT NULL DEFAULT 0,
  "firstUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FeatureUsageMonthly_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FeatureUsageMonthly_month_featureKey_action_firmId_actorUserId_actorRole_key"
  ON "FeatureUsageMonthly"("month", "featureKey", "action", "firmId", "actorUserId", "actorRole");

CREATE INDEX IF NOT EXISTS "FeatureUsageMonthly_month_featureKey_idx"
  ON "FeatureUsageMonthly"("month", "featureKey");

CREATE INDEX IF NOT EXISTS "FeatureUsageMonthly_firmId_month_idx"
  ON "FeatureUsageMonthly"("firmId", "month");

CREATE INDEX IF NOT EXISTS "FeatureUsageMonthly_actorUserId_month_idx"
  ON "FeatureUsageMonthly"("actorUserId", "month");
