ALTER TABLE "Transaction"
  ADD COLUMN IF NOT EXISTS "updatedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "deletedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "deletionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "counterpartyNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "cardNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "cardMaskedNumberSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Transaction"
SET "counterpartyNameSnapshot" = COALESCE(
      NULLIF(BTRIM(metadata->>'counterpartyLabel'), ''),
      NULLIF(BTRIM(metadata->>'payerLabel'), ''),
      NULLIF(BTRIM(metadata->>'receiverLabel'), '')
    ),
    "cardNameSnapshot" = NULLIF(BTRIM(metadata->>'paymentCardOwner'), ''),
    "cardMaskedNumberSnapshot" = CASE
      WHEN NULLIF(regexp_replace(COALESCE(metadata->>'paymentCardNumber', ''), '\D', '', 'g'), '') IS NULL THEN NULL
      ELSE '**** **** **** ' || RIGHT(regexp_replace(metadata->>'paymentCardNumber', '\D', '', 'g'), 4)
    END
WHERE "counterpartyNameSnapshot" IS NULL
   OR "cardNameSnapshot" IS NULL
   OR "cardMaskedNumberSnapshot" IS NULL;
