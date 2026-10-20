-- CreateEnum
CREATE TYPE "ClientStage" AS ENUM ('LEAD', 'PROSPECT', 'CUSTOMER', 'CHURNED');

-- CreateEnum
CREATE TYPE "OrderKind" AS ENUM ('ORDER', 'PROFORMA');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ACCOUNTANT';

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "address" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "followUpAt" TIMESTAMP(3),
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "placeType" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "stage" "ClientStage";

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "repId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracyM" DOUBLE PRECISION NOT NULL,
    "distanceM" DOUBLE PRECISION,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "price" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "kind" "OrderKind" NOT NULL DEFAULT 'ORDER',
    "status" "OrderStatus" NOT NULL DEFAULT 'SUBMITTED',
    "contactId" TEXT NOT NULL,
    "repId" TEXT NOT NULL,
    "visitId" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_lines" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "requestedQty" INTEGER NOT NULL,
    "requestedPrice" DECIMAL(12,2) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visits_repId_at_idx" ON "visits"("repId", "at");

-- CreateIndex
CREATE INDEX "visits_contactId_at_idx" ON "visits"("contactId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_number_key" ON "sales_orders"("number");

-- CreateIndex
CREATE INDEX "sales_orders_status_createdAt_idx" ON "sales_orders"("status", "createdAt");

-- CreateIndex
CREATE INDEX "sales_orders_repId_createdAt_idx" ON "sales_orders"("repId", "createdAt");

-- CreateIndex
CREATE INDEX "contacts_stage_idx" ON "contacts"("stage");

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_repId_fkey" FOREIGN KEY ("repId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_repId_fkey" FOREIGN KEY ("repId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
