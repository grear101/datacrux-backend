-- AlterTable: the storefront's URL slug (store.amaraagent.com/<slug>) and
-- a short tagline shown under the business name. Logo and accent color
-- are stored in the already-existing brandingJson field, so no new
-- columns are needed for those.
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "storeSlug" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "storeTagline" TEXT;

-- CreateIndex: slugs must be unique across the whole platform, since
-- they're the public URL path.
CREATE UNIQUE INDEX IF NOT EXISTS "clients_storeSlug_key" ON "clients"("storeSlug");

-- Per-platform ad/analytics tracking IDs, keyed by platform (e.g.
-- {"tiktok": "...", "meta": "...", "googleAnalytics": "G-..."}). A map
-- rather than dedicated columns, specifically so adding a new platform
-- later never needs another migration - just a new key.
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "trackingConfig" JSONB NOT NULL DEFAULT '{}';

-- AlterTable: extra gallery photos per product, on top of the existing
-- single imageUrl (which stays as the "cover" photo used everywhere
-- else - chat, widget, etc.).
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "imageUrls" JSONB NOT NULL DEFAULT '[]';
