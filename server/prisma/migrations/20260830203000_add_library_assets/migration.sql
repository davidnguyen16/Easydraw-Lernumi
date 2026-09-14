-- CreateTable
CREATE TABLE "LibraryAsset" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "paletteGroup" TEXT,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "checksum" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "searchAliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "legacyNodeType" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LibraryAsset_slug_key" ON "LibraryAsset"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryAsset_storageKey_key" ON "LibraryAsset"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryAsset_legacyNodeType_key" ON "LibraryAsset"("legacyNodeType");

-- CreateIndex
CREATE INDEX "LibraryAsset_category_status_sortOrder_idx" ON "LibraryAsset"("category", "status", "sortOrder");
