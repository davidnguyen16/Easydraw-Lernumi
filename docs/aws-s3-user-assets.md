# AWS S3 asset architecture

EasyDraw uses a hybrid asset model. Behavioural shapes remain code-native,
shared visual artwork is a versioned S3 catalog, and private user uploads have
their own ownership-scoped S3 prefix.

```text
Code-native nodes (frontend source)
├── Rectangle, Text, Entity, Group
├── UML/ERD shapes with editing behaviour
├── Network zones/containers
└── Connections and routing

S3 library assets (shared by every user)
├── library/network/<slug>/v<version>.svg
├── library/logo/<slug>/v<version>.<ext>
├── library/illustration/<slug>/v<version>.<ext>
└── library/decorative/<slug>/v<version>.<ext>

S3 user assets (private to one user)
├── pending/<userId>/<assetId>.<ext>
└── users/<userId>/assets/<assetId>.<ext>
```

S3 stores the file bytes. PostgreSQL stores searchable metadata, ownership,
the stable object key, and compatibility mappings. A diagram stores only a
stable asset id inside its existing JSON graph; it never stores image bytes or
an expiring signed URL.

## Database schema

```text
User 1 ── N Diagram
User 1 ── N Asset

LibraryAsset (global; no owner)
```

`Asset` is a private user upload:

| Field | Meaning |
| --- | --- |
| `ownerId` | User allowed to list, read, or delete it |
| `storageKey` | `users/<userId>/assets/<assetId>.<ext>` after verification |
| `mimeType`, `size`, `width`, `height` | Validated image metadata |
| `status` | `uploading` or `active` |

`LibraryAsset` is shared system artwork:

| Field | Meaning |
| --- | --- |
| `slug` | Stable admin-facing identity, such as `network-router` |
| `category`, `paletteGroup` | Sidebar grouping and search |
| `storageKey` | Versioned S3 object key under `library/` |
| `version`, `checksum` | Prevent accidental in-place replacement |
| `legacyNodeType` | Maps old `NetworkRouterNode` diagrams to the S3 asset |
| `metadata` | Minimum size, aspect ratio, and connection-handle bounds |
| `status`, `sortOrder`, `searchAliases` | Catalog publication and discovery |

Code-native nodes do not get database rows because their renderer and
behaviour are part of the deployed application. `Diagram.data` continues to
hold every node's id, type, position and edge references.

## Backward compatibility

The initial manifest contains 34 network-device SVGs exported from the former
frontend primitive catalog. New drags create `LibraryAssetNode` records that
refer to `LibraryAsset.id`. Existing diagrams keep their original node type,
for example `NetworkRouterNode`; the renderer resolves it through
`LibraryAsset.legacyNodeType`.

No bulk graph rewrite occurs. Existing node ids, `x/y` positions, sizes, and
edge `source`/`target` values stay unchanged. The old device types remain
registered but hidden from the palette. Network containers and connection
presets remain code-native because they have editor behaviour rather than just
artwork.

## 1. Create the bucket

From `server/`, deploy the included CloudFormation template:

```powershell
aws cloudformation deploy `
  --stack-name easydraw-assets `
  --template-file aws/assets-bucket.yml `
  --parameter-overrides ClientOrigin=https://easydraw.net
```

Read the generated bucket name:

```powershell
aws cloudformation describe-stacks `
  --stack-name easydraw-assets `
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" `
  --output text
```

The bucket remains private. The template enables encryption, configures CORS
for production and local clients, and removes abandoned `pending/` uploads
after one day. Downloads use one-hour signed URLs.

## 2. Give the API access

Attach `server/aws/ecs-task-role-assets-policy.json` to the **ECS task role**,
not the task execution role, after replacing the bucket placeholder. The API
and catalog importer need `GetObject`, `PutObject`, and `DeleteObject` for that
bucket's objects.

For local development, use an AWS profile or temporary credentials. Never put
long-lived AWS credentials in frontend environment variables or commit them.

## 3. Configure, migrate, and import

```dotenv
AWS_REGION=ap-southeast-2
AWS_S3_ASSETS_BUCKET=<cloudformation-output>
ASSET_MAX_FILE_BYTES=10485760
ASSET_USER_QUOTA_BYTES=104857600
```

Run:

```powershell
cd server
npx prisma migrate deploy
npm run library:validate
npm run library:import
```

`library:validate` checks the manifest and all local source files without AWS
or PostgreSQL. `library:import` uploads versioned objects and upserts catalog
metadata. If bytes change without a version increase, the import fails instead
of overwriting a published object silently.

The checked-in catalog source and authoring rules are documented in
`server/library-assets/README.md`. Logos, illustrations and decorative icons
are supported by the schema and importer; the initial manifest contains the
network catalog only.

## API flow

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/library-assets` | Shared S3 library with signed URLs and metadata |
| `GET` | `/library-assets/:id/url` | Refresh a library asset URL |
| `GET` | `/library-assets/legacy/:nodeType` | Resolve a saved legacy network node |
| `POST` | `/assets/uploads` | Create a restricted user presigned POST |
| `POST` | `/assets/:id/complete` | Verify and activate a user upload |
| `GET` | `/assets` | List the signed-in user's private uploads |
| `GET` | `/assets/:id/url` | Refresh a private user asset URL |
| `DELETE` | `/assets/:id` | Delete a user asset from S3 and PostgreSQL |
