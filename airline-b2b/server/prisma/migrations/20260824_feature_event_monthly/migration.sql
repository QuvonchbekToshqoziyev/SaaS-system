CREATE TABLE IF NOT EXISTS "FeatureEventMonthly" (
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
  CONSTRAINT "FeatureEventMonthly_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FeatureEventMonthly_month_featureKey_action_firmId_actorUserId_actorRole_key"
  ON "FeatureEventMonthly"("month", "featureKey", "action", "firmId", "actorUserId", "actorRole");
CREATE INDEX IF NOT EXISTS "FeatureEventMonthly_month_featureKey_idx"
  ON "FeatureEventMonthly"("month", "featureKey");
CREATE INDEX IF NOT EXISTS "FeatureEventMonthly_firmId_month_idx"
  ON "FeatureEventMonthly"("firmId", "month");
CREATE INDEX IF NOT EXISTS "FeatureEventMonthly_actorUserId_month_idx"
  ON "FeatureEventMonthly"("actorUserId", "month");
