-- CreateTable
-- Uses IF NOT EXISTS / a guarded exception block throughout, since an
-- earlier in-progress attempt at this table may or may not have already
-- run directly against the database. This makes it safe to apply either
-- way, without needing to check first.
CREATE TABLE IF NOT EXISTS "handover_requests" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "conversationId" TEXT,
    "summary" TEXT NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handover_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "handover_requests_clientId_idx" ON "handover_requests"("clientId");

-- AddForeignKey (skipped quietly if it already exists)
DO $$
BEGIN
    ALTER TABLE "handover_requests"
      ADD CONSTRAINT "handover_requests_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
