-- AlterTable
ALTER TABLE "products" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "products" ADD COLUMN "isService" BOOLEAN NOT NULL DEFAULT false;
