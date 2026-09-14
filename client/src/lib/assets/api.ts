import { API_URL } from '@/lib/api';

export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 8192;

export interface UserAsset {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  createdAt: string;
  downloadUrl: string;
  downloadUrlExpiresAt: string;
}

interface UploadIntent {
  assetId: string;
  uploadUrl: string;
  fields: Record<string, string>;
  expiresIn: number;
}

export interface AssetDownload {
  url: string;
  expiresAt: string;
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(', ');
    if (typeof body.message === 'string' && body.message.trim()) return body.message;
  } catch {
    // S3 failures can be XML and API failures can be empty. Keep a stable UI message.
  }
  return fallback;
}

async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The selected file is not a valid image'));
    });
    image.src = objectUrl;
    await loaded;
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function uploadFormToS3(
  intent: UploadIntent,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', intent.uploadUrl);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error('S3 rejected the image upload'));
    };
    request.onerror = () => reject(new Error('Could not connect to S3'));

    const form = new FormData();
    Object.entries(intent.fields).forEach(([key, value]) => form.append(key, value));
    // S3 expects the binary file field after all signed policy fields.
    form.append('file', file);
    request.send(form);
  });
}

export async function listAssets(): Promise<UserAsset[]> {
  const response = await fetch(`${API_URL}/assets`, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Could not load your uploads'));
  }
  const assets = (await response.json()) as UserAsset[];
  assets.forEach(cacheAssetDownload);
  return assets;
}

export async function uploadAsset(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UserAsset> {
  if (!ALLOWED_IMAGE_TYPES.some((type) => type === file.type)) {
    throw new Error('Choose a PNG, JPEG, or WebP image');
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    throw new Error('Image must be no larger than 10 MB');
  }

  const dimensions = await readImageDimensions(file);
  if (
    dimensions.width < 1 ||
    dimensions.height < 1 ||
    dimensions.width > MAX_IMAGE_DIMENSION ||
    dimensions.height > MAX_IMAGE_DIMENSION
  ) {
    throw new Error('Image dimensions must not exceed 8192 × 8192 pixels');
  }

  const createResponse = await fetch(`${API_URL}/assets/uploads`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      ...dimensions,
    }),
  });
  if (!createResponse.ok) {
    throw new Error(await errorMessage(createResponse, 'Could not prepare the upload'));
  }

  const intent = (await createResponse.json()) as UploadIntent;
  try {
    await uploadFormToS3(intent, file, onProgress);
    const completeResponse = await fetch(`${API_URL}/assets/${intent.assetId}/complete`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!completeResponse.ok) {
      throw new Error(await errorMessage(completeResponse, 'Could not verify the uploaded image'));
    }
    const asset = (await completeResponse.json()) as UserAsset;
    cacheAssetDownload(asset);
    return asset;
  } catch (error) {
    // Best-effort cleanup of an unfinished upload record/object.
    await fetch(`${API_URL}/assets/${intent.assetId}`, {
      method: 'DELETE',
      credentials: 'include',
    }).catch(() => undefined);
    throw error;
  }
}

export async function deleteAsset(assetId: string): Promise<void> {
  const response = await fetch(`${API_URL}/assets/${assetId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Could not delete the image'));
  }
  downloadCache.delete(assetId);
}

const downloadCache = new Map<string, AssetDownload>();
const downloadRequests = new Map<string, Promise<AssetDownload>>();
const REFRESH_AHEAD_MS = 5 * 60 * 1000;

function cacheAssetDownload(asset: UserAsset): void {
  downloadCache.set(asset.id, {
    url: asset.downloadUrl,
    expiresAt: asset.downloadUrlExpiresAt,
  });
}

export async function resolveAssetDownload(
  assetId: string,
  forceRefresh = false,
): Promise<AssetDownload> {
  const cached = downloadCache.get(assetId);
  if (
    !forceRefresh &&
    cached &&
    Date.parse(cached.expiresAt) - Date.now() > REFRESH_AHEAD_MS
  ) {
    return cached;
  }

  const pending = downloadRequests.get(assetId);
  if (pending && !forceRefresh) return pending;

  const request = fetch(`${API_URL}/assets/${assetId}/url`, {
    credentials: 'include',
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(await errorMessage(response, 'Image is unavailable'));
      }
      const download = (await response.json()) as AssetDownload;
      downloadCache.set(assetId, download);
      return download;
    })
    .finally(() => downloadRequests.delete(assetId));

  downloadRequests.set(assetId, request);
  return request;
}
