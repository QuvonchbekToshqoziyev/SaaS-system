-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "loginUserId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mfaConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "mfaRecoveryCodeHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "mfaRecoveryCodeLastUsedAt" TIMESTAMP(3),
ADD COLUMN     "mfaSecret" TEXT,
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Employee_loginUserId_key" ON "Employee"("loginUserId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_loginUserId_fkey" FOREIGN KEY ("loginUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

