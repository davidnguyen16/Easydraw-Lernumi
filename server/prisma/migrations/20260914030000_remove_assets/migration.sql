-- User uploads and the shared S3 library were removed from the app.
-- Object storage (S3) is not part of this deployment, so the tables held
-- nothing reachable; drop them together with their indexes and foreign key.

-- DropForeignKey
ALTER TABLE "Asset" DROP CONSTRAINT "Asset_ownerId_fkey";

-- DropTable
DROP TABLE "Asset";

-- DropTable
DROP TABLE "LibraryAsset";
