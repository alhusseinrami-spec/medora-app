-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'SALESPERSON';
ALTER TYPE "Role" ADD VALUE 'DRIVER';

-- AlterTable
ALTER TABLE "sales_orders" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "deliveryAccuracyM" DOUBLE PRECISION,
ADD COLUMN     "deliveryDistanceM" DOUBLE PRECISION,
ADD COLUMN     "deliveryLat" DOUBLE PRECISION,
ADD COLUMN     "deliveryLng" DOUBLE PRECISION,
ADD COLUMN     "deliveryNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "deliveryVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "driverId" TEXT;

-- CreateIndex
CREATE INDEX "sales_orders_driverId_deliveredAt_idx" ON "sales_orders"("driverId", "deliveredAt");

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
