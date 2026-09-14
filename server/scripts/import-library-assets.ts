import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import type { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { S3AssetsStorage } from '../src/assets/s3-assets.storage';
import {
  detectAssetMimeType,
  readAssetDimensions,
} from '../src/assets/asset-signature';

const CATEGORIES = ['network', 'logo', 'illustration', 'decorative'] as const;
const MIME_TYPES = [
  'image/svg+xml',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

interface ManifestAsset {
  slug: string;
  name: string;
  category: (typeof CATEGORIES)[number];
  paletteGroup?: string;
  file: string;
  mimeType: (typeof MIME_TYPES)[number];
  width: number;
  height: number;
  version: number;
  sortOrder?: number;
  searchAliases?: string[];
  legacyNodeType?: string;
  metadata?: Record<string, unknown>;
}

interface LibraryManifest {
  schemaVersion: 1;
  assets: ManifestAsset[];
}

function assertSafeSvg(bytes: Uint8Array): void {
  const svg = Buffer.from(bytes).toString('utf8');
  const lower = svg.toLowerCase();
  if (!lower.includes('<svg') || !lower.includes('</svg>')) {
    throw new Error('SVG root element is missing');
  }
  const forbidden = [
    '<script',
    '<foreignobject',
    'javascript:',
    'data:text/html',
  ];
  if (
    forbidden.some((value) => lower.includes(value)) ||
    /\son[a-z]+\s*=/.test(lower)
  ) {
    throw new Error('SVG contains executable or embedded HTML content');
  }
}

function validateManifestAsset(asset: ManifestAsset): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(asset.slug)) {
    throw new Error(`Invalid slug: ${asset.slug}`);
  }
  if (!asset.name?.trim()) throw new Error(`Name is missing for ${asset.slug}`);
  if (!CATEGORIES.includes(asset.category)) {
    throw new Error(`Invalid category for ${asset.slug}: ${asset.category}`);
  }
  if (!MIME_TYPES.includes(asset.mimeType)) {
    throw new Error(`Invalid MIME type for ${asset.slug}: ${asset.mimeType}`);
  }
  if (!Number.isInteger(asset.width) || asset.width < 1 || asset.width > 8192) {
    throw new Error(`Invalid width for ${asset.slug}`);
  }
  if (
    !Number.isInteger(asset.height) ||
    asset.height < 1 ||
    asset.height > 8192
  ) {
    throw new Error(`Invalid height for ${asset.slug}`);
  }
  if (!Number.isInteger(asset.version) || asset.version < 1) {
    throw new Error(`Invalid version for ${asset.slug}`);
  }
}

function extensionFor(mimeType: ManifestAsset['mimeType']): string {
  if (mimeType === 'image/svg+xml') return 'svg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpg';
  return 'webp';
}

async function main() {
  const args = process.argv.slice(2);
  const validateOnly = args.includes('--validate-only');
  const suppliedManifestPath = args.find(
    (argument) => !argument.startsWith('--'),
  );
  const manifestPath = resolve(
    suppliedManifestPath ??
      resolve(process.cwd(), 'library-assets/manifest.json'),
  );
  const assetRoot = dirname(manifestPath);
  const manifest = JSON.parse(
    await readFile(manifestPath, 'utf8'),
  ) as LibraryManifest;
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.assets)) {
    throw new Error('Unsupported library manifest');
  }

  const prisma = validateOnly ? null : new PrismaService();
  const storage = validateOnly ? null : new S3AssetsStorage();
  if (prisma) await prisma.$connect();
  try {
    for (const asset of manifest.assets) {
      validateManifestAsset(asset);
      const filePath = resolve(assetRoot, asset.file);
      const relativePath = relative(assetRoot, filePath);
      if (relativePath.startsWith(`..${sep}`) || relativePath === '..') {
        throw new Error(`Asset file escapes manifest directory: ${asset.file}`);
      }
      const bytes = new Uint8Array(await readFile(filePath));
      if (bytes.length < 1 || bytes.length > 10 * 1024 * 1024) {
        throw new Error(`Invalid file size for ${asset.slug}`);
      }

      if (asset.mimeType === 'image/svg+xml') {
        assertSafeSvg(bytes);
      } else {
        const detected = detectAssetMimeType(bytes);
        const dimensions = detected
          ? readAssetDimensions(bytes, detected)
          : null;
        if (
          detected !== asset.mimeType ||
          !dimensions ||
          dimensions.width !== asset.width ||
          dimensions.height !== asset.height
        ) {
          throw new Error(
            `File content does not match manifest for ${asset.slug}`,
          );
        }
      }

      if (!prisma || !storage) {
        process.stdout.write(`Validated ${asset.slug} v${asset.version}\n`);
        continue;
      }

      const checksum = createHash('sha256').update(bytes).digest('hex');
      const current = await prisma.libraryAsset.findUnique({
        where: { slug: asset.slug },
      });
      if (
        current &&
        current.checksum !== checksum &&
        asset.version <= current.version
      ) {
        throw new Error(
          `${asset.slug} changed without a version bump (current v${current.version})`,
        );
      }

      const storageKey = `library/${asset.category}/${asset.slug}/v${asset.version}.${extensionFor(asset.mimeType)}`;
      await storage.putLibraryObject({
        key: storageKey,
        body: bytes,
        mimeType: asset.mimeType,
        slug: asset.slug,
        version: asset.version,
        checksum,
      });
      await prisma.libraryAsset.upsert({
        where: { slug: asset.slug },
        create: {
          slug: asset.slug,
          name: asset.name.trim(),
          category: asset.category,
          paletteGroup: asset.paletteGroup,
          storageKey,
          mimeType: asset.mimeType,
          size: bytes.length,
          width: asset.width,
          height: asset.height,
          version: asset.version,
          checksum,
          sortOrder: asset.sortOrder ?? 0,
          searchAliases: asset.searchAliases ?? [],
          legacyNodeType: asset.legacyNodeType,
          metadata: asset.metadata as Prisma.InputJsonValue | undefined,
        },
        update: {
          name: asset.name.trim(),
          category: asset.category,
          paletteGroup: asset.paletteGroup,
          storageKey,
          mimeType: asset.mimeType,
          size: bytes.length,
          width: asset.width,
          height: asset.height,
          version: asset.version,
          checksum,
          status: 'active',
          sortOrder: asset.sortOrder ?? 0,
          searchAliases: asset.searchAliases ?? [],
          legacyNodeType: asset.legacyNodeType,
          metadata: asset.metadata as Prisma.InputJsonValue | undefined,
        },
      });
      process.stdout.write(`Imported ${asset.slug} v${asset.version}\n`);
    }
  } finally {
    if (prisma) await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
