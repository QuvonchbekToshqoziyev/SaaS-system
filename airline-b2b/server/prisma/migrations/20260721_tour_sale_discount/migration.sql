ALTER TABLE "TourPackageSale"
  ADD COLUMN IF NOT EXISTS "grossAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "netAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discountPercent" DECIMAL(9,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "saleNote" TEXT,
  ADD COLUMN IF NOT EXISTS "exchangeRateSnapshot" DECIMAL(18,8) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "grossAmountBaseCurrency" DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discountAmountBaseCurrency" DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "netAmountBaseCurrency" DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "unitCostSnapshot" DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "costOfGoodsSold" DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "grossProfit" DECIMAL(18,4) NOT NULL DEFAULT 0;

UPDATE "TourPackageSale" sale
SET "grossAmount" = sale."totalAmount",
    "netAmount" = sale."totalAmount",
    "discountAmount" = 0,
    "discountPercent" = 0,
    "saleNote" = COALESCE(NULLIF(BTRIM(sale."saleNote"), ''), NULLIF(BTRIM(sale.notes), ''), 'Eski tur sotuv yozuvi'),
    "exchangeRateSnapshot" = COALESCE((SELECT tx."exchangeRate" FROM "Transaction" tx WHERE tx.id = sale."transactionId"), 1),
    "grossAmountBaseCurrency" = COALESCE((SELECT tx."baseAmount" FROM "Transaction" tx WHERE tx.id = sale."transactionId"), sale."totalAmount"),
    "discountAmountBaseCurrency" = 0,
    "netAmountBaseCurrency" = COALESCE((SELECT tx."baseAmount" FROM "Transaction" tx WHERE tx.id = sale."transactionId"), sale."totalAmount"),
    "unitCostSnapshot" = package."unitPrice",
    "costOfGoodsSold" = package."unitPrice" * sale.quantity,
    "grossProfit" = sale."totalAmount" - (package."unitPrice" * sale.quantity)
FROM "TourPackage" package
WHERE package.id = sale."packageId"
  AND sale."grossAmount" = 0
  AND sale."netAmount" = 0;
