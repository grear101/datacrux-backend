-- AlterTable: the actual structured date/time for a service booking,
-- separate from deliveryAddress (which can still hold a location, e.g.
-- "at customer's home", or be used normally for physical products).
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3);
