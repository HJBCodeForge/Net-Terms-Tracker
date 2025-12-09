-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT,
    "customerEmail" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop" ("shop") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Invoice" ("amount", "createdAt", "currency", "customerEmail", "customerId", "customerName", "dueDate", "id", "orderId", "orderNumber", "shop", "status") SELECT "amount", "createdAt", "currency", "customerEmail", "customerId", "customerName", "dueDate", "id", "orderId", "orderNumber", "shop", "status" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId");
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Shop" ("billingStatus", "createdAt", "customerCount", "id", "plan", "shop", "subscriptionId", "updatedAt") SELECT "billingStatus", "createdAt", "customerCount", "id", "plan", "shop", "subscriptionId", "updatedAt" FROM "Shop";
DROP TABLE "Shop";
ALTER TABLE "new_Shop" RENAME TO "Shop";
CREATE UNIQUE INDEX "Shop_shop_key" ON "Shop"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
