ALTER TYPE "FinancialAccountType" ADD VALUE IF NOT EXISTS 'BANK_ACCOUNT';
ALTER TYPE "FinancialAccountType" ADD VALUE IF NOT EXISTS 'CASH_DESK';
ALTER TYPE "FinancialAccountType" ADD VALUE IF NOT EXISTS 'PAYMENT_CARD';
ALTER TYPE "FinancialAccountType" ADD VALUE IF NOT EXISTS 'RECEIVABLE_ACCOUNT';
ALTER TYPE "FinancialAccountType" ADD VALUE IF NOT EXISTS 'PAYABLE_ACCOUNT';
ALTER TYPE "FinancialAccountType" ADD VALUE IF NOT EXISTS 'FOUNDER_ACCOUNT';
ALTER TYPE "FinancialAccountType" ADD VALUE IF NOT EXISTS 'ADVANCE_ACCOUNT';
ALTER TYPE "FinancialAccountType" ADD VALUE IF NOT EXISTS 'CLEARING_ACCOUNT';
ALTER TYPE "FinancialAccountType" ADD VALUE IF NOT EXISTS 'OTHER_ACCOUNT';

ALTER TABLE "Firm"
  ADD COLUMN IF NOT EXISTS "accountingFramework" TEXT NOT NULL DEFAULT 'MANAGEMENT_ONLY',
  ADD COLUMN IF NOT EXISTS "accountingPolicyVersion" TEXT NOT NULL DEFAULT '1',
  ADD COLUMN IF NOT EXISTS "chartOfAccountsVersion" TEXT NOT NULL DEFAULT '1',
  ADD COLUMN IF NOT EXISTS "reportingStartDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fiscalYearStart" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Tashkent';

ALTER TABLE "FinancialAccount"
  ADD COLUMN IF NOT EXISTS "bankName" TEXT,
  ADD COLUMN IF NOT EXISTS "accountNumberMasked" TEXT,
  ADD COLUMN IF NOT EXISTS "bankCode" TEXT,
  ADD COLUMN IF NOT EXISTS "swiftCode" TEXT,
  ADD COLUMN IF NOT EXISTS "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

ALTER TABLE "Transaction"
  ADD COLUMN IF NOT EXISTS "operationType" TEXT,
  ADD COLUMN IF NOT EXISTS "destinationAmount" DECIMAL(18,4),
  ADD COLUMN IF NOT EXISTS "destinationCurrency" TEXT,
  ADD COLUMN IF NOT EXISTS "economicPurpose" TEXT,
  ADD COLUMN IF NOT EXISTS "expenseDirection" TEXT,
  ADD COLUMN IF NOT EXISTS "accountingTreatment" TEXT,
  ADD COLUMN IF NOT EXISTS "expenseCategoryId" TEXT,
  ADD COLUMN IF NOT EXISTS "expenseSubcategoryId" TEXT,
  ADD COLUMN IF NOT EXISTS "costCenterId" TEXT,
  ADD COLUMN IF NOT EXISTS "employeeId" TEXT,
  ADD COLUMN IF NOT EXISTS "counterpartyId" TEXT,
  ADD COLUMN IF NOT EXISTS "expenseDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paymentDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "documentDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "postingDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reportingPeriod" TEXT,
  ADD COLUMN IF NOT EXISTS "documentNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "taxDeductible" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "vatAmount" DECIMAL(18,4),
  ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT;

CREATE TABLE IF NOT EXISTS "ExpenseCategory" (
  id TEXT NOT NULL,
  "firmId" TEXT NOT NULL,
  "parentId" TEXT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  "categoryType" TEXT NOT NULL DEFAULT 'OPERATING_EXPENSE',
  "accountingTreatment" TEXT NOT NULL DEFAULT 'EXPENSE',
  "financialStatementGroup" TEXT NOT NULL DEFAULT 'OPERATING_EXPENSES',
  "cashFlowGroup" TEXT NOT NULL DEFAULT 'OPERATING',
  "defaultAccountCode" TEXT,
  "taxDeductible" BOOLEAN NOT NULL DEFAULT true,
  "requiresEmployee" BOOLEAN NOT NULL DEFAULT false,
  "requiresCounterparty" BOOLEAN NOT NULL DEFAULT false,
  "requiresDocument" BOOLEAN NOT NULL DEFAULT false,
  "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
  "budgetEnabled" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isSystemDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS "CostCenter" (
  id TEXT NOT NULL,
  "firmId" TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CostCenter_pkey" PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS "ExpenseBudget" (
  id TEXT NOT NULL,
  "firmId" TEXT NOT NULL,
  "expenseCategoryId" TEXT,
  "costCenterId" TEXT,
  "periodType" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  amount DECIMAL(18,4) NOT NULL,
  currency TEXT NOT NULL,
  "limitAction" TEXT NOT NULL DEFAULT 'WARNING',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpenseBudget_pkey" PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS "ExpenseApprovalRule" (
  id TEXT NOT NULL,
  "firmId" TEXT NOT NULL,
  "expenseCategoryId" TEXT,
  "minimumAmount" DECIMAL(18,4),
  currency TEXT,
  "requiredRole" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpenseApprovalRule_pkey" PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS "JournalEntry" (
  id TEXT NOT NULL,
  "firmId" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'POSTED',
  "postingDate" TIMESTAMP(3) NOT NULL,
  description TEXT,
  "reversalOfId" TEXT,
  "postedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalEntry_pkey" PRIMARY KEY (id)
);

ALTER TABLE "LedgerEntry" ADD COLUMN IF NOT EXISTS "journalEntryId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseCategory_firmId_code_key" ON "ExpenseCategory"("firmId", code);
CREATE INDEX IF NOT EXISTS "ExpenseCategory_firmId_parentId_isActive_sortOrder_idx" ON "ExpenseCategory"("firmId", "parentId", "isActive", "sortOrder");
CREATE INDEX IF NOT EXISTS "ExpenseCategory_deletedAt_idx" ON "ExpenseCategory"("deletedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "CostCenter_firmId_code_key" ON "CostCenter"("firmId", code);
CREATE INDEX IF NOT EXISTS "CostCenter_firmId_isActive_idx" ON "CostCenter"("firmId", "isActive");
CREATE INDEX IF NOT EXISTS "ExpenseBudget_firmId_periodStart_periodEnd_isActive_idx" ON "ExpenseBudget"("firmId", "periodStart", "periodEnd", "isActive");
CREATE INDEX IF NOT EXISTS "ExpenseBudget_expenseCategoryId_periodStart_periodEnd_idx" ON "ExpenseBudget"("expenseCategoryId", "periodStart", "periodEnd");
CREATE INDEX IF NOT EXISTS "ExpenseApprovalRule_firmId_isActive_idx" ON "ExpenseApprovalRule"("firmId", "isActive");
CREATE INDEX IF NOT EXISTS "ExpenseApprovalRule_expenseCategoryId_isActive_idx" ON "ExpenseApprovalRule"("expenseCategoryId", "isActive");
CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_transactionId_key" ON "JournalEntry"("transactionId");
CREATE INDEX IF NOT EXISTS "JournalEntry_firmId_postingDate_status_idx" ON "JournalEntry"("firmId", "postingDate", status);
CREATE INDEX IF NOT EXISTS "JournalEntry_reversalOfId_idx" ON "JournalEntry"("reversalOfId");
CREATE INDEX IF NOT EXISTS "LedgerEntry_journalEntryId_idx" ON "LedgerEntry"("journalEntryId");
CREATE INDEX IF NOT EXISTS "Transaction_firmId_operationType_status_createdAt_idx" ON "Transaction"("firmId", "operationType", status, "createdAt");
CREATE INDEX IF NOT EXISTS "Transaction_expenseCategoryId_expenseDate_idx" ON "Transaction"("expenseCategoryId", "expenseDate");
CREATE INDEX IF NOT EXISTS "Transaction_costCenterId_expenseDate_idx" ON "Transaction"("costCenterId", "expenseDate");
CREATE INDEX IF NOT EXISTS "FinancialAccount_firmId_deletedAt_idx" ON "FinancialAccount"("firmId", "deletedAt");

DO $$ BEGIN ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"(id) ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ExpenseCategory"(id) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"(id) ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ExpenseBudget" ADD CONSTRAINT "ExpenseBudget_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"(id) ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ExpenseBudget" ADD CONSTRAINT "ExpenseBudget_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory"(id) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ExpenseBudget" ADD CONSTRAINT "ExpenseBudget_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"(id) ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ExpenseApprovalRule" ADD CONSTRAINT "ExpenseApprovalRule_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"(id) ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ExpenseApprovalRule" ADD CONSTRAINT "ExpenseApprovalRule_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory"(id) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory"(id) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"(id) ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"(id) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"(id) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "JournalEntry"(id) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_postedByUserId_fkey" FOREIGN KEY ("postedByUserId") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"(id) ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

WITH defaults(code, name, category_type, sort_order) AS (
  VALUES
    ('SALARY', 'Ish haqi', 'EMPLOYEE_EXPENSE', 0), ('BONUSES', 'Mukofot va bonuslar', 'EMPLOYEE_EXPENSE', 1),
    ('RENT', 'Ijara', 'OPERATING_EXPENSE', 2), ('UTILITIES', 'Kommunal xizmatlar', 'OPERATING_EXPENSE', 3),
    ('INTERNET_COMMUNICATION', 'Internet va aloqa', 'OPERATING_EXPENSE', 4), ('MARKETING', 'Marketing va reklama', 'OPERATING_EXPENSE', 5),
    ('CORPORATE_MEALS', 'Korporativ tushlik', 'OPERATING_EXPENSE', 6), ('TRANSPORT', 'Transport', 'OPERATING_EXPENSE', 7),
    ('FUEL', 'Yoqilg‘i', 'OPERATING_EXPENSE', 8), ('BUSINESS_TRAVEL', 'Xizmat safari', 'OPERATING_EXPENSE', 9),
    ('OFFICE_EXPENSE', 'Ofis xarajatlari', 'OPERATING_EXPENSE', 10), ('OFFICE_SUPPLIES', 'Kanselyariya', 'OPERATING_EXPENSE', 11),
    ('SOFTWARE_SUBSCRIPTION', 'Dasturiy ta’minot va obunalar', 'OPERATING_EXPENSE', 12), ('BANK_FEES', 'Bank komissiyasi', 'FINANCE_COST', 13),
    ('PROFESSIONAL_SERVICES', 'Konsalting va professional xizmatlar', 'OPERATING_EXPENSE', 14), ('REPAIR_MAINTENANCE', 'Ta’mirlash va texnik xizmat', 'OPERATING_EXPENSE', 15),
    ('INSURANCE', 'Sug‘urta', 'OPERATING_EXPENSE', 16), ('TAXES_FEES', 'Soliq va yig‘imlar', 'TAX_PAYMENT', 17),
    ('REPRESENTATION', 'Vakillik xarajatlari', 'OPERATING_EXPENSE', 18), ('OTHER_OPERATING', 'Boshqa operatsion xarajat', 'OTHER_EXPENSE', 19)
)
INSERT INTO "ExpenseCategory" (id, "firmId", code, name, "categoryType", "accountingTreatment", "financialStatementGroup", "cashFlowGroup", "requiresEmployee", "sortOrder", "isSystemDefault", "createdAt", "updatedAt")
SELECT 'exp-' || substr(md5(firm.id || ':' || defaults.code), 1, 28), firm.id, defaults.code, defaults.name, defaults.category_type,
       'EXPENSE', CASE WHEN defaults.category_type = 'FINANCE_COST' THEN 'FINANCE_COSTS' ELSE 'OPERATING_EXPENSES' END,
       'OPERATING', defaults.code IN ('SALARY', 'BONUSES'), defaults.sort_order, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Firm" firm CROSS JOIN defaults
ON CONFLICT ("firmId", code) DO NOTHING;
