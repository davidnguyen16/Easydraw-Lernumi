import type { AllowedAssetMimeType } from './assets.constants';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

export function detectAssetMimeType(
  bytes: Uint8Array,
): AllowedAssetMimeType | null {
  if (bytes.length >= 8 && startsWith(bytes, PNG_SIGNATURE)) {
    return 'image/png';
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

export interface AssetDimensions {
  width: number;
  height: number;
}

function uint16BigEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset] * 256 + bytes[offset + 1];
}

function uint32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
}

function jpegDimensions(bytes: Uint8Array): AssetDimensions | null {
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  let offset = 2;

  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 1;
      continue;
    }

    const lengthOffset = offset + 1;
    if (lengthOffset + 1 >= bytes.length) break;
    const segmentLength = uint16BigEndian(bytes, lengthOffset);
    if (segmentLength < 2) break;

    if (startOfFrameMarkers.has(marker) && offset + 7 < bytes.length) {
      return {
        height: uint16BigEndian(bytes, offset + 4),
        width: uint16BigEndian(bytes, offset + 6),
      };
    }
    offset = lengthOffset + segmentLength;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array): AssetDimensions | null {
  const chunk = ascii(bytes, 12, 16);
  if (chunk === 'VP8X' && bytes.length >= 30) {
    return {
      width: 1 + bytes[24] + bytes[25] * 256 + bytes[26] * 65536,
      height: 1 + bytes[27] + bytes[28] * 256 + bytes[29] * 65536,
    };
  }
  if (
    chunk === 'VP8 ' &&
    bytes.length >= 30 &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    return {
      width: (bytes[26] + bytes[27] * 256) & 0x3fff,
      height: (bytes[28] + bytes[29] * 256) & 0x3fff,
    };
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height:
        1 +
        ((bytes[22] & 0xc0) >> 6) +
        (bytes[23] << 2) +
        ((bytes[24] & 0x0f) << 10),
    };
  }
  return null;
}

export function readAssetDimensions(
  bytes: Uint8Array,
  mimeType: AllowedAssetMimeType,
): AssetDimensions | null {
  if (mimeType === 'image/png' && bytes.length >= 24) {
    return {
      width: uint32BigEndian(bytes, 16),
      height: uint32BigEndian(bytes, 20),
    };
  }
  if (mimeType === 'image/jpeg') return jpegDimensions(bytes);
  if (mimeType === 'image/webp') return webpDimensions(bytes);
  return null;
}
