import { API_URL } from '@/lib/api';

export interface AssetHandleBounds {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LibraryAssetMetadata {
  minWidth?: number;
  minHeight?: number;
  keepAspectRatio?: boolean;
  handleBounds?: AssetHandleBounds | null;
}

export interface LibraryAsset {
  id: string;
  slug: string;
  name: string;
  category: 'network' | 'logo' | 'illustration' | 'decorative';
  paletteGroup: string | null;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  version: number;
  sortOrder: number;
  searchAliases: string[];
  legacyNodeType: string | null;
  metadata: LibraryAssetMetadata | null;
  downloadUrl: string;
  downloadUrlExpiresAt: string;
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (typeof body.message === 'string' && body.message.trim()) return body.message;
  } catch {
    // Keep a stable message for empty or non-JSON failures.
  }
  return fallback;
}

const byId = new Map<string, LibraryAsset>();
const byLegacyType = new Map<string, LibraryAsset>();
const requests = new Map<string, Promise<LibraryAsset>>();
const REFRESH_AHEAD_MS = 5 * 60 * 1000;

function cache(asset: LibraryAsset): LibraryAsset {
  byId.set(asset.id, asset);
  if (asset.legacyNodeType) byLegacyType.set(asset.legacyNodeType, asset);
  return asset;
}

function isFresh(asset: LibraryAsset | undefined): asset is LibraryAsset {
  return Boolean(
    asset &&
      Date.parse(asset.downloadUrlExpiresAt) - Date.now() > REFRESH_AHEAD_MS,
  );
}

export async function listLibraryAssets(): Promise<LibraryAsset[]> {
  const response = await fetch(`${API_URL}/library-assets`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Could not load the S3 library'));
  }
  const assets = (await response.json()) as LibraryAsset[];
  assets.forEach(cache);
  return assets;
}

export async function resolveLibraryAsset(
  assetId: string,
  forceRefresh = false,
): Promise<LibraryAsset> {
  const cached = byId.get(assetId);
  if (!forceRefresh && isFresh(cached)) return cached;
  const requestKey = `id:${assetId}`;
  const pending = requests.get(requestKey);
  if (pending && !forceRefresh) return pending;

  const request = fetch(`${API_URL}/library-assets/${assetId}/url`, {
    credentials: 'include',
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(await errorMessage(response, 'Library asset is unavailable'));
      }
      return cache((await response.json()) as LibraryAsset);
    })
    .finally(() => requests.delete(requestKey));
  requests.set(requestKey, request);
  return request;
}

export async function resolveLegacyLibraryAsset(
  nodeType: string,
  forceRefresh = false,
): Promise<LibraryAsset> {
  const cached = byLegacyType.get(nodeType);
  if (!forceRefresh && isFresh(cached)) return cached;
  const requestKey = `legacy:${nodeType}`;
  const pending = requests.get(requestKey);
  if (pending && !forceRefresh) return pending;

  const request = fetch(`${API_URL}/library-assets/legacy/${encodeURIComponent(nodeType)}`, {
    credentials: 'include',
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(await errorMessage(response, 'Legacy network asset is unavailable'));
      }
      return cache((await response.json()) as LibraryAsset);
    })
    .finally(() => requests.delete(requestKey));
  requests.set(requestKey, request);
  return request;
}
