-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('NEW', 'NEGOTIATION', 'DOCUMENTATION', 'PAYMENT_PENDING', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "assignedAgentId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "expectedClosingDate" TIMESTAMP(3),
    "status" "DealStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deals_status_createdAt_idx" ON "deals"("status", "createdAt");

-- CreateIndex
CREATE INDEX "deals_assignedAgentId_idx" ON "deals"("assignedAgentId");

-- CreateIndex
CREATE INDEX "deals_propertyId_idx" ON "deals"("propertyId");

-- CreateIndex
CREATE INDEX "deals_clientId_idx" ON "deals"("clientId");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
