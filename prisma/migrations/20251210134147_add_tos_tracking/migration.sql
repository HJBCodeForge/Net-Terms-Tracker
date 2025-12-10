-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "subscriptionId" TEXT,
    "billingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "customerCount" INTEGER NOT NULL DEFAULT 0,
    "brandColor" TEXT NOT NULL DEFAULT '#008060',
    "logoUrl" TEXT,
    "businessName" TEXT,
    "businessAddress" TEXT,
    "termsAccepted" BOOLEAN NOT NULL DEFAULT false,
    "termsAcceptedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Shop" ("billingStatus", "brandColor", "businessAddress", "businessName", "createdAt", "customerCount", "id", "logoUrl", "plan", "shop", "subscriptionId", "updatedAt") SELECT "billingStatus", "brandColor", "businessAddress", "businessName", "createdAt", "customerCount", "id", "logoUrl", "plan", "shop", "subscriptionId", "updatedAt" FROM "Shop";
DROP TABLE "Shop";
ALTER TABLE "new_Shop" RENAME TO "Shop";
CREATE UNIQUE INDEX "Shop_shop_key" ON "Shop"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
