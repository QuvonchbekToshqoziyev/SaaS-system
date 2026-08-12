-- CreateEnum
CREATE TYPE "InventoryDocumentType" AS ENUM ('PURCHASE', 'CUSTOMER_RETURN', 'INTERNAL_RECEIPT', 'FOUNDER_CONTRIBUTION', 'INVENTORY_SURPLUS', 'PRODUCTION_RECEIPT', 'FREE_RECEIPT', 'SALE', 'INTERNAL_USE', 'TRANSFER', 'WRITE_OFF', 'SUPPLIER_RETURN', 'EMPLOYEE_ISSUE', 'FREE_ISSUE', 'INVENTORY_SHORTAGE', 'OTHER_RECEIPT', 'OTHER_ISSUE');

-- CreateEnum
CREATE TYPE "InventoryDocumentStatus" AS ENUM ('DRAFT', 'SENT', 'IN_TRANSIT', 'APPLIED', 'RECEIVED', 'REJECTED', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('PURCHASE_IN', 'SALE_OUT', 'CUSTOMER_RETURN_IN', 'SUPPLIER_RETURN_OUT', 'INTERNAL_USE_OUT', 'TRANSFER_OUT', 'TRANSFER_IN', 'WRITE_OFF_OUT', 'INVENTORY_SURPLUS_IN', 'INVENTORY_SHORTAGE_OUT', 'PRODUCTION_IN', 'FREE_RECEIPT_IN', 'EMPLOYEE_ISSUE_OUT', 'FREE_ISSUE_OUT', 'OTHER_IN', 'OTHER_OUT');

-- CreateEnum
CREATE TYPE "InventoryReservationStatus" AS ENUM ('RESERVED', 'PARTIALLY_CONSUMED', 'CONSUMED', 'RELEASED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Firm" ADD COLUMN "inventoryValuationMethod" TEXT NOT NULL DEFAULT 'MOVING_WEIGHTED_AVERAGE';

-- CreateTable
CREATE TABLE "InventoryCategory" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "parentId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystemDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryUnit" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUnitId" TEXT,
    "conversionToBase" DECIMAL(18,6),
    "isSystemDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventorySupplier" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "paymentTerms" TEXT,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'UZS',
    "creditLimit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventorySupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCustomer" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BUSINESS',
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "responsiblePerson" TEXT,
    "creditLimit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "paymentTerms" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "responsibleUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "minimumStock" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "reorderPoint" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "defaultPurchasePrice" DECIMAL(18,4),
    "defaultSalePrice" DECIMAL(18,4),
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "defaultSupplierId" TEXT,
    "defaultWarehouseId" TEXT,
    "tracksBatch" BOOLEAN NOT NULL DEFAULT false,
    "tracksExpiry" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBatch" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "manufactureDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "receivedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "reservedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "issuedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "exchangeRateSnapshot" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "supplierId" TEXT,
    "sourceDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryDocument" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "type" "InventoryDocumentType" NOT NULL,
    "status" "InventoryDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "documentNumber" TEXT NOT NULL,
    "documentDate" TIMESTAMP(3) NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "destinationWarehouseId" TEXT,
    "supplierId" TEXT,
    "customerId" TEXT,
    "paymentStatus" TEXT,
    "paymentSourceAccountId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "exchangeRateSnapshot" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "grossAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "contractNumber" TEXT,
    "invoiceNumber" TEXT,
    "flightId" TEXT,
    "tourPackageId" TEXT,
    "costCenterId" TEXT,
    "employeeId" TEXT,
    "notes" TEXT,
    "attachment" JSONB,
    "createdByUserId" TEXT,
    "approvedByUserId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "reversedDocumentId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryDocumentLine" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT,
    "batchNumber" TEXT,
    "manufactureDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "unitCostSnapshot" DECIMAL(18,4) NOT NULL,
    "lineTotal" DECIMAL(18,4) NOT NULL,
    "baseLineTotal" DECIMAL(18,4) NOT NULL,
    "discountAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryDocumentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "destinationWarehouseId" TEXT,
    "productId" TEXT NOT NULL,
    "batchId" TEXT,
    "documentId" TEXT,
    "documentLineId" TEXT,
    "movementType" "InventoryMovementType" NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitCostSnapshot" DECIMAL(18,4) NOT NULL,
    "totalCostSnapshot" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "exchangeRateSnapshot" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "sourceType" TEXT,
    "sourceReferenceId" TEXT,
    "documentNumber" TEXT,
    "movementDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "createdByUserId" TEXT,
    "approvedByUserId" TEXT,
    "reversedMovementId" TEXT,
    "transactionId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReservation" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceReferenceId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "consumedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "status" "InventoryReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "expiresAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "releasedByUserId" TEXT,
    "releaseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryCategory_firmId_parentId_isActive_idx" ON "InventoryCategory"("firmId", "parentId", "isActive");

-- CreateIndex
CREATE INDEX "InventoryCategory_deletedAt_idx" ON "InventoryCategory"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCategory_firmId_code_key" ON "InventoryCategory"("firmId", "code");

-- CreateIndex
CREATE INDEX "InventoryUnit_firmId_isActive_idx" ON "InventoryUnit"("firmId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryUnit_firmId_code_key" ON "InventoryUnit"("firmId", "code");

-- CreateIndex
CREATE INDEX "InventorySupplier_firmId_status_idx" ON "InventorySupplier"("firmId", "status");

-- CreateIndex
CREATE INDEX "InventorySupplier_firmId_name_idx" ON "InventorySupplier"("firmId", "name");

-- CreateIndex
CREATE INDEX "InventorySupplier_deletedAt_idx" ON "InventorySupplier"("deletedAt");

-- CreateIndex
CREATE INDEX "InventoryCustomer_firmId_status_idx" ON "InventoryCustomer"("firmId", "status");

-- CreateIndex
CREATE INDEX "InventoryCustomer_firmId_name_idx" ON "InventoryCustomer"("firmId", "name");

-- CreateIndex
CREATE INDEX "InventoryCustomer_deletedAt_idx" ON "InventoryCustomer"("deletedAt");

-- CreateIndex
CREATE INDEX "Warehouse_firmId_status_idx" ON "Warehouse"("firmId", "status");

-- CreateIndex
CREATE INDEX "Warehouse_deletedAt_idx" ON "Warehouse"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_firmId_code_key" ON "Warehouse"("firmId", "code");

-- CreateIndex
CREATE INDEX "Product_firmId_name_idx" ON "Product"("firmId", "name");

-- CreateIndex
CREATE INDEX "Product_firmId_status_idx" ON "Product"("firmId", "status");

-- CreateIndex
CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Product_firmId_sku_key" ON "Product"("firmId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_firmId_barcode_key" ON "Product"("firmId", "barcode");

-- CreateIndex
CREATE INDEX "InventoryBatch_firmId_productId_expiryDate_idx" ON "InventoryBatch"("firmId", "productId", "expiryDate");

-- CreateIndex
CREATE INDEX "InventoryBatch_warehouseId_productId_status_idx" ON "InventoryBatch"("warehouseId", "productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBatch_warehouseId_productId_batchNumber_key" ON "InventoryBatch"("warehouseId", "productId", "batchNumber");

-- CreateIndex
CREATE INDEX "InventoryDocument_firmId_type_status_documentDate_idx" ON "InventoryDocument"("firmId", "type", "status", "documentDate");

-- CreateIndex
CREATE INDEX "InventoryDocument_warehouseId_documentDate_idx" ON "InventoryDocument"("warehouseId", "documentDate");

-- CreateIndex
CREATE INDEX "InventoryDocument_deletedAt_idx" ON "InventoryDocument"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryDocument_firmId_documentNumber_key" ON "InventoryDocument"("firmId", "documentNumber");

-- CreateIndex
CREATE INDEX "InventoryDocumentLine_documentId_idx" ON "InventoryDocumentLine"("documentId");

-- CreateIndex
CREATE INDEX "InventoryDocumentLine_productId_batchId_idx" ON "InventoryDocumentLine"("productId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_transactionId_key" ON "InventoryMovement"("transactionId");

-- CreateIndex
CREATE INDEX "InventoryMovement_firmId_movementDate_idx" ON "InventoryMovement"("firmId", "movementDate");

-- CreateIndex
CREATE INDEX "InventoryMovement_warehouseId_productId_batchId_status_idx" ON "InventoryMovement"("warehouseId", "productId", "batchId", "status");

-- CreateIndex
CREATE INDEX "InventoryMovement_sourceType_sourceReferenceId_idx" ON "InventoryMovement"("sourceType", "sourceReferenceId");

-- CreateIndex
CREATE INDEX "InventoryMovement_reversedMovementId_idx" ON "InventoryMovement"("reversedMovementId");

-- CreateIndex
CREATE INDEX "InventoryMovement_deletedAt_idx" ON "InventoryMovement"("deletedAt");

-- CreateIndex
CREATE INDEX "InventoryReservation_firmId_sourceType_sourceReferenceId_idx" ON "InventoryReservation"("firmId", "sourceType", "sourceReferenceId");

-- CreateIndex
CREATE INDEX "InventoryReservation_warehouseId_productId_status_idx" ON "InventoryReservation"("warehouseId", "productId", "status");

-- AddForeignKey
ALTER TABLE "InventoryCategory" ADD CONSTRAINT "InventoryCategory_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCategory" ADD CONSTRAINT "InventoryCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "InventoryCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryUnit" ADD CONSTRAINT "InventoryUnit_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySupplier" ADD CONSTRAINT "InventorySupplier_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCustomer" ADD CONSTRAINT "InventoryCustomer_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "InventoryCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_defaultSupplierId_fkey" FOREIGN KEY ("defaultSupplierId") REFERENCES "InventorySupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_defaultWarehouseId_fkey" FOREIGN KEY ("defaultWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "InventorySupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "InventoryDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocument" ADD CONSTRAINT "InventoryDocument_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocument" ADD CONSTRAINT "InventoryDocument_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocument" ADD CONSTRAINT "InventoryDocument_destinationWarehouseId_fkey" FOREIGN KEY ("destinationWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocument" ADD CONSTRAINT "InventoryDocument_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "InventorySupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocument" ADD CONSTRAINT "InventoryDocument_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "InventoryCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocumentLine" ADD CONSTRAINT "InventoryDocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "InventoryDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocumentLine" ADD CONSTRAINT "InventoryDocumentLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocumentLine" ADD CONSTRAINT "InventoryDocumentLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_destinationWarehouseId_fkey" FOREIGN KEY ("destinationWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "InventoryDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_documentLineId_fkey" FOREIGN KEY ("documentLineId") REFERENCES "InventoryDocumentLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Stock and monetary invariants remain enforced even if a future caller bypasses the service.
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_non_negative_stock_check"
CHECK ("receivedQuantity" >= 0 AND "issuedQuantity" >= 0 AND "reservedQuantity" >= 0 AND "receivedQuantity" >= "issuedQuantity" + "reservedQuantity");

ALTER TABLE "InventoryDocumentLine" ADD CONSTRAINT "InventoryDocumentLine_positive_quantity_check"
CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "discountAmount" >= 0);

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_positive_quantity_check"
CHECK ("quantity" > 0 AND "unitCostSnapshot" >= 0 AND "totalCostSnapshot" >= 0);

ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_quantity_check"
CHECK ("quantity" > 0 AND "consumedQuantity" >= 0 AND "consumedQuantity" <= "quantity");
