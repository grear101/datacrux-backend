-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "lastOrderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_clientId_idx" ON "customers"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_clientId_phone_key" ON "customers"("clientId", "phone");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
