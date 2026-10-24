-- AlterTable: free-text product details (size/color/material/quantity
-- calculations) for AMARA to reference, separate from the marketing-style
-- description.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "specifications" TEXT;

-- AlterTable: max products a business can have, matching the Pricing
-- page's advertised per-plan limits. Nullable = unlimited, same pattern
-- as conversationLimit - existing businesses are untouched.
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "productLimit" INTEGER;
