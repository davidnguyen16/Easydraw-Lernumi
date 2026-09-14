import { detectAssetMimeType, readAssetDimensions } from './asset-signature';

describe('detectAssetMimeType', () => {
  it('detects PNG, JPEG, and WebP signatures', () => {
    expect(
      detectAssetMimeType(
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe('image/png');
    expect(detectAssetMimeType(Uint8Array.from([0xff, 0xd8, 0xff]))).toBe(
      'image/jpeg',
    );
    expect(
      detectAssetMimeType(
        Uint8Array.from([
          0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
        ]),
      ),
    ).toBe('image/webp');
  });

  it('rejects a filename-only fake image', () => {
    expect(
      detectAssetMimeType(
        new TextEncoder().encode('<script>alert(1)</script>'),
      ),
    ).toBeNull();
  });

  it('reads PNG dimensions from the IHDR header', () => {
    const header = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48,
      0x44, 0x52, 0, 0, 4, 0, 0, 0, 3, 0,
    ]);
    expect(readAssetDimensions(header, 'image/png')).toEqual({
      width: 1024,
      height: 768,
    });
  });
});
