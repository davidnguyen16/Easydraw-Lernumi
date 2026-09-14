import type { LibraryAssetMetadata } from '@/lib/assets/library-api';

export const CUSTOM_IMAGE_NODE_TYPE = 'CustomImageNode';
export const LIBRARY_ASSET_NODE_TYPE = 'LibraryAssetNode';

export interface CustomImageNodeData {
  assetId?: string;
  name: string;
  source?: 'user' | 'library';
  label?: string;
  metadata?: LibraryAssetMetadata | null;
  opacity?: number;
  rotation?: number;
  shadow?: boolean;
  fillColor?: string;
  borderColor?: string;
  borderWidth?: number;
  rounded?: boolean;
  textColor?: string;
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}
