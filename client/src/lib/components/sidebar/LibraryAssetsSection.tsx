'use client';

import { useEffect, useMemo, useState, type DragEvent } from 'react';
import {
  listLibraryAssets,
  type LibraryAsset,
} from '@/lib/assets/library-api';
import { clearDragPayload, setDragPayload } from '@/lib/flow/dnd';

const CATEGORY_LABELS: Record<LibraryAsset['category'], string> = {
  network: 'Network icons',
  logo: 'Logos',
  illustration: 'Illustrations',
  decorative: 'Decorative icons',
};

const CATEGORY_ORDER: LibraryAsset['category'][] = [
  'network',
  'logo',
  'illustration',
  'decorative',
];

function startDrag(event: DragEvent, asset: LibraryAsset) {
  setDragPayload(event.dataTransfer, {
    kind: 'library-asset',
    assetId: asset.id,
    name: asset.name,
    width: asset.width,
    height: asset.height,
    metadata: asset.metadata,
  });
}

export default function LibraryAssetsSection({ searchQuery }: { searchQuery: string }) {
  const [expanded, setExpanded] = useState(false);
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listLibraryAssets()
      .then((items) => {
        if (active) setAssets(items);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Library unavailable');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!searchQuery) return assets;
    return assets.filter((asset) =>
      [asset.name, asset.category, ...asset.searchAliases].some((value) =>
        value.toLowerCase().includes(searchQuery),
      ),
    );
  }, [assets, searchQuery]);

  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    assets: filtered.filter((asset) => asset.category === category),
  })).filter((group) => group.assets.length > 0);
  const forceExpanded = searchQuery.length > 0 && groups.length > 0;
  const isExpanded = forceExpanded || expanded;

  return (
    <section className="flex flex-col gap-[0.6rem]">
      <button
        type="button"
        className="group flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-0 py-[0.2rem] text-left text-primary-deep"
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
        <span className="text-[0.72rem] font-bold tracking-[0.06em] uppercase group-hover:underline">
          S3 LIBRARY
        </span>
      </button>

      {isExpanded ? (
        <div className="flex flex-col gap-3 pl-[1.4rem]">
          {loading ? <p className="text-[0.75rem] text-ink-muted">Loading library…</p> : null}
          {error ? <p className="text-[0.7rem] leading-snug text-danger">{error}</p> : null}
          {!loading && !error && groups.length === 0 ? (
            <p className="text-[0.75rem] leading-snug text-ink-muted italic">
              {searchQuery ? 'No matching library assets.' : 'No library assets imported yet.'}
            </p>
          ) : null}

          {groups.map((group) => (
            <section key={group.category} className="flex flex-col gap-2">
              <h3 className="m-0 text-[0.7rem] font-semibold text-ink-soft">{group.label}</h3>
              <div className="grid grid-cols-3 gap-2">
                {group.assets.map((asset) => (
                  <div key={asset.id} className="min-w-0">
                    <div
                      className="flex aspect-square cursor-grab items-center justify-center overflow-hidden rounded-lg border border-[#dee6e8] bg-white p-1 hover:border-primary active:cursor-grabbing"
                      draggable
                      onDragStart={(event) => startDrag(event, asset)}
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
                    <p className="mt-1 truncate text-center text-[0.64rem] text-ink-muted" title={asset.name}>
                      {asset.name}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
}
