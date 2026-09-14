# Library asset source files

This directory is the deployment source for EasyDraw's shared S3 catalog. It
is not served by NestJS and is not included in the frontend bundle.

- `manifest.json` contains searchable metadata and stable legacy-node mapping.
- `network/` contains the 34 SVGs exported from the former frontend network
  primitive catalog.
- Add future logos, illustrations, and decorative icons under their own
  folders and register them in the manifest.

Validate files without AWS or PostgreSQL:

```powershell
npm run library:validate
```

After bumping an asset's `version`, migrate the database and upload the catalog:

```powershell
npx prisma migrate deploy
npm run library:import
```

Changing file bytes without increasing `version` is rejected. S3 keys are
versioned (`library/<category>/<slug>/v<version>.<ext>`), so a deployment never
overwrites an older object in place.
