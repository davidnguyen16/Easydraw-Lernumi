export const ALLOWED_ASSET_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export type AllowedAssetMimeType = (typeof ALLOWED_ASSET_MIME_TYPES)[number];

export const DEFAULT_MAX_ASSET_BYTES = 10 * 1024 * 1024;
export const DEFAULT_USER_ASSET_QUOTA_BYTES = 100 * 1024 * 1024;
export const MAX_ASSET_DIMENSION = 8192;
export const UPLOAD_EXPIRY_SECONDS = 5 * 60;
export const DOWNLOAD_EXPIRY_SECONDS = 60 * 60;

export const ASSET_STATUS = {
  uploading: 'uploading',
  active: 'active',
} as const;

export function extensionForMimeType(mimeType: AllowedAssetMimeType): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpg';
  return 'webp';
}

export function isAllowedAssetMimeType(
  value: string,
): value is AllowedAssetMimeType {
  return ALLOWED_ASSET_MIME_TYPES.some((mimeType) => mimeType === value);
}
