-- CreateEnum
CREATE TYPE "ShopOrderStatus" AS ENUM ('PLACED', 'CONFIRMED', 'TO_DELIVER', 'DELIVERED', 'CANCELLED');

-- AlterTable
ALTER TABLE "push_subscribers" ADD COLUMN     "customerId" TEXT;

-- CreateTable
CREATE TABLE "shop_customers" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyEnc" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "lang" TEXT NOT NULL DEFAULT 'en',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_orders" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "ref" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'shop',
    "status" "ShopOrderStatus" NOT NULL DEFAULT 'PLACED',
    "lines" JSONB NOT NULL,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "estimatedAt" TIMESTAMP(3),
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "confirmedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_order_events" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "ShopOrderStatus" NOT NULL,
    "estimatedAt" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',
    "byName" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_order_documents" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_order_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_customers_keyHash_key" ON "shop_customers"("keyHash");

-- CreateIndex
CREATE INDEX "shop_customers_phone_idx" ON "shop_customers"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "shop_orders_number_key" ON "shop_orders"("number");

-- CreateIndex
CREATE UNIQUE INDEX "shop_orders_ref_key" ON "shop_orders"("ref");

-- CreateIndex
CREATE INDEX "shop_orders_customerId_createdAt_idx" ON "shop_orders"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "shop_orders_status_createdAt_idx" ON "shop_orders"("status", "createdAt");

-- CreateIndex
CREATE INDEX "shop_order_events_orderId_at_idx" ON "shop_order_events"("orderId", "at");

-- CreateIndex
CREATE INDEX "shop_order_documents_orderId_idx" ON "shop_order_documents"("orderId");

-- CreateIndex
CREATE INDEX "push_subscribers_customerId_idx" ON "push_subscribers"("customerId");

-- AddForeignKey
ALTER TABLE "push_subscribers" ADD CONSTRAINT "push_subscribers_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "shop_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "shop_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order_events" ADD CONSTRAINT "shop_order_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "shop_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order_documents" ADD CONSTRAINT "shop_order_documents_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "shop_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

