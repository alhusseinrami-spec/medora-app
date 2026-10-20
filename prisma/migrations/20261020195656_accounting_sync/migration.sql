-- AlterTable
ALTER TABLE "sales_orders" ADD COLUMN     "nextSyncAt" TIMESTAMP(3),
ADD COLUMN     "syncAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "syncError" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "syncStatus" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "syncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "sales_orders_syncStatus_nextSyncAt_idx" ON "sales_orders"("syncStatus", "nextSyncAt");
