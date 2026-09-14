// Only code-native network containers use this palette icon. Device artwork is
// loaded from the S3-backed LibraryAsset catalog instead.
export default function NetworkPaletteIcon() {
  return (
    <svg viewBox="0 0 40 32" className="h-8 w-9" aria-hidden="true">
      <rect
        x="2"
        y="3"
        width="36"
        height="26"
        rx="2"
        fill="#ffffff"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      <rect x="2" y="3" width="36" height="6" rx="2" fill="currentColor" opacity="0.12" />
    </svg>
  );
}
