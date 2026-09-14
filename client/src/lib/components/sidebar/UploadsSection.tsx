'use client';

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { deleteAsset, listAssets, uploadAsset, type UserAsset } from '@/lib/assets/api';
import { clearDragPayload, setDragPayload } from '@/lib/flow/dnd';

interface Props {
  searchQuery: string;
}

function onAssetDragStart(event: DragEvent, asset: UserAsset) {
  setDragPayload(event.dataTransfer, {
    kind: 'asset',
    assetId: asset.id,
    name: asset.name,
    width: asset.width,
    height: asset.height,
  });
}

export default function UploadsSection({ searchQuery }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(true);
  const [assets, setAssets] = useState<UserAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listAssets()
      .then((items) => {
        if (active) setAssets(items);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Could not load uploads');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const visibleAssets = useMemo(() => {
    if (!searchQuery) return assets;
    return assets.filter((asset) => asset.name.toLowerCase().includes(searchQuery));
  }, [assets, searchQuery]);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    for (const file of Array.from(files)) {
      try {
        setUploading(file.name);
        setProgress(0);
        const asset = await uploadAsset(file, setProgress);
        setAssets((current) => [asset, ...current]);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Upload failed');
        break;
      }
    }
    setUploading(null);
    setProgress(0);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function remove(asset: UserAsset) {
    if (!window.confirm(`Delete “${asset.name}”? Existing diagrams using it will show a missing image.`)) {
      return;
    }
    setError(null);
    try {
      await deleteAsset(asset.id);
      setAssets((current) => current.filter((item) => item.id !== asset.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Delete failed');
    }
  }

  const forceExpanded = searchQuery.length > 0 && visibleAssets.length > 0;
  const isExpanded = forceExpanded || expanded;

  return (
    <section className="flex flex-col gap-[0.6rem]">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="group flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-none bg-transparent px-0 py-[0.2rem] text-left text-primary-deep"
          aria-expanded={isExpanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <svg
            className={`size-3.5 shrink-0 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
          <span className="truncate text-[0.72rem] font-bold tracking-[0.06em] uppercase group-hover:underline">
            MY UPLOADS
          </span>
        </button>

        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={(event) => void uploadFiles(event.currentTarget.files)}
        />
        <button
          type="button"
          className="shrink-0 rounded-md bg-primary px-2 py-1 text-[0.68rem] font-semibold text-white hover:bg-primary-deep disabled:cursor-wait disabled:opacity-60"
          disabled={uploading !== null}
          onClick={() => inputRef.current?.click()}
        >
          Upload
        </button>
      </div>

      {isExpanded ? (
        <div className="pl-[1.4rem]">
          {uploading ? (
            <div className="mb-2">
              <div className="mb-1 flex justify-between gap-2 text-[0.68rem] text-ink-muted">
                <span className="truncate">{uploading}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#dee6e8]">
                <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : null}

          {error ? <p className="mb-2 text-[0.7rem] leading-snug text-danger">{error}</p> : null}

          {loading ? (
            <p className="text-[0.75rem] text-ink-muted">Loading uploads…</p>
          ) : visibleAssets.length === 0 ? (
            <p className="text-[0.75rem] leading-snug text-ink-muted italic">
              {searchQuery ? 'No matching uploads.' : 'Upload PNG, JPEG, or WebP images.'}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {visibleAssets.map((asset) => (
                <div key={asset.id} className="group relative min-w-0">
                  <div
                    className="flex aspect-square cursor-grab items-center justify-center overflow-hidden rounded-lg border border-[#dee6e8] bg-white p-1 hover:border-primary active:cursor-grabbing"
                    draggable
                    onDragStart={(event) => onAssetDragStart(event, asset)}
                    onDragEnd={clearDragPayload}
                    title={`${asset.name} — drag onto canvas`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.downloadUrl}
                      alt={asset.name}
                      crossOrigin="anonymous"
                      draggable={false}
                      className="pointer-events-none max-h-full max-w-full object-contain"
                    />
                  </div>
                  <button
                    type="button"
                    className="absolute -top-1 -right-1 hidden size-5 items-center justify-center rounded-full border border-line bg-white text-xs leading-none text-primary shadow-sm group-hover:flex hover:bg-[#fff1f2]"
                    aria-label={`Delete ${asset.name}`}
                    title={`Delete ${asset.name}`}
                    onClick={() => void remove(asset)}
                  >
                    ×
                  </button>
                  <p className="mt-1 truncate text-center text-[0.64rem] text-ink-muted" title={asset.name}>
                    {asset.name}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
