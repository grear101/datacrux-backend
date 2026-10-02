-- CreateTable
CREATE TABLE IF NOT EXISTS "notification_logs" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notification_logs_clientId_idx" ON "notification_logs"("clientId");

-- CreateIndex: this is what actually enforces "once per threshold per
-- period" at the database level, as a second line of defense alongside
-- the application-level check-before-send.
CREATE UNIQUE INDEX IF NOT EXISTS "notification_logs_clientId_type_periodKey_key" ON "notification_logs"("clientId", "type", "periodKey");

-- AddForeignKey (skipped quietly if it already exists)
DO $$
BEGIN
    ALTER TABLE "notification_logs"
      ADD CONSTRAINT "notification_logs_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
