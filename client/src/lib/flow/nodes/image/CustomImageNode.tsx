'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Handle, NodeResizer, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { resolveAssetDownload } from '@/lib/assets/api';
import {
  resolveLegacyLibraryAsset,
  resolveLibraryAsset,
  type LibraryAssetMetadata,
} from '@/lib/assets/library-api';
import { toFiniteRotation } from '../style-utils';
import {
  CUSTOM_IMAGE_NODE_TYPE,
  LIBRARY_ASSET_NODE_TYPE,
  type CustomImageNodeData,
} from './types';

const CONNECTION_HANDLE_CLASS =
  'shape-conn pointer-events-none opacity-0 transition-opacity duration-[120ms] ' +
  'group-hover:pointer-events-auto group-hover:opacity-100 ' +
  'group-[.selected]:pointer-events-auto group-[.selected]:opacity-100';

export default function CustomImageNode({ id, type, data, selected, isConnectable }: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const image = (data ?? {}) as unknown as CustomImageNodeData;
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [remoteMetadata, setRemoteMetadata] = useState<LibraryAssetMetadata | null>(null);
  const [remoteName, setRemoteName] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState(false);
  const labelInputRef = useRef<HTMLTextAreaElement>(null);

  // The same renderer serves user uploads, new library nodes, and legacy
  // Network* node types. Legacy nodes resolve by type so their saved data,
  // coordinates, ids, and connected edges never need a destructive rewrite.
  const isLibrary = image.source === 'library' || type !== CUSTOM_IMAGE_NODE_TYPE;
  const legacyNodeType =
    isLibrary && type && type !== LIBRARY_ASSET_NODE_TYPE ? type : null;

  useEffect(() => {
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const refresh = async (force = false) => {
      try {
        if (!image.assetId && !legacyNodeType) throw new Error('Asset id is missing');
        const download = legacyNodeType
          ? await resolveLegacyLibraryAsset(legacyNodeType, force)
          : isLibrary
            ? await resolveLibraryAsset(image.assetId!, force)
            : await resolveAssetDownload(image.assetId!, force);
        if (!active) return;

        const url = 'downloadUrl' in download ? download.downloadUrl : download.url;
        const expiresAt =
          'downloadUrlExpiresAt' in download
            ? download.downloadUrlExpiresAt
            : download.expiresAt;
        setSource(url);
        if ('metadata' in download) {
          setRemoteMetadata(download.metadata);
          setRemoteName(download.name);
        }
        setFailed(false);
        const refreshIn = Math.max(
          30_000,
          Date.parse(expiresAt) - Date.now() - 5 * 60 * 1000,
        );
        refreshTimer = setTimeout(() => void refresh(true), refreshIn);
      } catch {
        if (active) setFailed(true);
      }
    };

    void refresh();
    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [image.assetId, isLibrary, legacyNodeType]);

  const opacity = Math.max(0, Math.min(100, Number(image.opacity ?? 100))) / 100;
  const rotation = toFiniteRotation(image.rotation);
  const borderWidth = Math.max(0, Number(image.borderWidth ?? 0));
  const metadata = image.metadata ?? remoteMetadata;
  const bounds = metadata?.handleBounds ?? {
    top: 0,
    right: 100,
    bottom: 100,
    left: 0,
  };
  const imageStyle: CSSProperties = {
    opacity,
    transform: `rotate(${rotation}deg)`,
    transformOrigin: 'center',
    filter: image.shadow ? 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.18))' : 'none',
    backgroundColor: image.fillColor ?? 'transparent',
    border: `${borderWidth}px solid ${image.borderColor ?? '#2c2c2a'}`,
    borderRadius: image.rounded ? 8 : 0,
  };
  const label = String(image.label ?? remoteName ?? image.name ?? '');
  const labelStyle: CSSProperties = {
    color: image.textColor ?? '#2c2c2a',
    fontFamily: image.fontFamily ?? 'inherit',
    fontSize: `${Number(image.fontSize ?? 13)}px`,
    fontWeight: image.bold ? 700 : 500,
    fontStyle: image.italic ? 'italic' : 'normal',
    textDecoration: image.underline ? 'underline' : 'none',
    opacity,
  };

  function startLabelEditing() {
    if (!isLibrary) return;
    setEditingLabel(true);
    requestAnimationFrame(() => {
      labelInputRef.current?.focus();
      labelInputRef.current?.select();
    });
  }

  return (
    <div
      className={`group relative h-full min-h-5 w-full min-w-5 ${selected ? 'selected' : ''}`}
      onDoubleClick={(event) => {
        event.stopPropagation();
        startLabelEditing();
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden group-[.selected]:shadow-[0_0_0_2px_#189589]"
        style={imageStyle}
      >
        {source && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={source}
            alt={remoteName ?? image.name ?? 'Image asset'}
            crossOrigin="anonymous"
            draggable={false}
            className="h-full w-full object-contain"
            onError={() => setFailed(true)}
          />
        ) : failed ? (
          <span className="px-2 text-center text-[11px] text-primary">Image unavailable</span>
        ) : (
          <span className="text-[11px] text-ink-muted">Loading…</span>
        )}
      </div>

      {isLibrary && label ? (
        <textarea
          ref={labelInputRef}
          rows={1}
          value={label}
          readOnly={!editingLabel}
          spellCheck={false}
          aria-label="Library asset label"
          className={`nodrag absolute top-full left-1/2 mt-1 block h-auto w-[max(100%,140px)] resize-none overflow-hidden border-none bg-transparent px-1 text-center outline-none [translate:-50%_0] ${editingLabel ? 'pointer-events-auto cursor-text select-text' : 'pointer-events-none select-none'}`}
          style={labelStyle}
          onChange={(event) => updateNodeData(id, { label: event.currentTarget.value })}
          onBlur={() => setEditingLabel(false)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape') event.currentTarget.blur();
          }}
          onPointerDown={(event) => {
            if (editingLabel) event.stopPropagation();
          }}
        />
      ) : null}

      <NodeResizer
        isVisible={selected}
        minWidth={metadata?.minWidth ?? 20}
        minHeight={metadata?.minHeight ?? 20}
        keepAspectRatio={metadata?.keepAspectRatio ?? true}
        handleClassName="shape-resize-anchor"
        lineClassName="shape-resize-line"
      />
      <Handle
        type="source"
        position={Position.Top}
        id="top"
        isConnectable={isConnectable}
        className={CONNECTION_HANDLE_CLASS}
        style={{ top: `${bounds.top}%` }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        isConnectable={isConnectable}
        className={CONNECTION_HANDLE_CLASS}
        style={{ right: `${100 - bounds.right}%` }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        isConnectable={isConnectable}
        className={CONNECTION_HANDLE_CLASS}
        style={{ bottom: `${100 - bounds.bottom}%` }}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        isConnectable={isConnectable}
        className={CONNECTION_HANDLE_CLASS}
        style={{ left: `${bounds.left}%` }}
      />
    </div>
  );
}
