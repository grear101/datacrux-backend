-- AlterTable: subscription details for each business.
-- All columns are nullable or have defaults, so existing businesses (your
-- pilots) are untouched: no plan, no conversation limit (= unlimited), and
-- no trial end date (= a trial that never expires).
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "plan" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "conversationLimit" INTEGER;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "setupFeePaid" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: how many customer messages a conversation has had, used to
-- cap runaway sessions.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "messageCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex: makes "how many conversations this month" fast.
CREATE INDEX IF NOT EXISTS "conversations_clientId_createdAt_idx" ON "conversations"("clientId", "createdAt");
