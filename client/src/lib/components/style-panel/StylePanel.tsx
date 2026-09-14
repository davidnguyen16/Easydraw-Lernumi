'use client';

import { useState } from 'react';
import type { Node } from '@xyflow/react';
import StyleTab from './StyleTab';
import TextTab from './TextTab';
import ArrangeTab from './ArrangeTab';
import type { NodeStyleData } from './types';
import { getShape } from '@/lib/flow/nodes/registry';
import type { NodeDataChangeOptions } from '@/lib/flow/nodes/types';
import { FLOATING_STYLE_PANEL_RIGHT_GAP_PX, FLOATING_STYLE_PANEL_WIDTH_PX } from './layout';
import { CUSTOM_IMAGE_NODE_TYPE } from '@/lib/flow/nodes/image/types';

// Ported from StylePanel.svelte. Shapes may ship a custom editor tab via the
// registry (e.g. EntityNode's Fields editor) — surfaced generically here.
type StyleTabId = 'style' | 'text' | 'panel' | 'arrange';

interface Props {
  node: Node;
  onStyleChange: (patch: Partial<NodeStyleData>) => void;
  onNodeDataChange: (
    nodeId: string,
    patch: Record<string, unknown>,
    options?: NodeDataChangeOptions,
  ) => void;
  onFontPreview: (family: string) => void;
  onFontPreviewEnd: () => void;
  onPositionChange: (x: number, y: number) => void;
  onSizeChange: (width: number, height: number) => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const TAB_CLASS =
  'relative flex-1 cursor-pointer border-none bg-transparent py-3.5 text-[0.88rem] ' +
  'text-ink-soft transition-colors duration-[120ms] hover:text-primary-deep ' +
  "[&.active]:font-semibold [&.active]:text-primary-deep [&.active]:after:absolute " +
  "[&.active]:after:right-3 [&.active]:after:bottom-[-1px] [&.active]:after:left-3 " +
  "[&.active]:after:h-0.5 [&.active]:after:rounded-[1px] [&.active]:after:bg-primary-deep " +
  "[&.active]:after:content-['']";

export default function StylePanel({
  node,
  onStyleChange,
  onNodeDataChange,
  onFontPreview,
  onFontPreviewEnd,
  onPositionChange,
  onSizeChange,
  onBringToFront,
  onSendToBack,
  onDuplicate,
  onDelete,
}: Props) {
  const [activeTab, setActiveTab] = useState<StyleTabId>('style');

  // The shape registry tells us whether the selected node ships a custom editor
  // tab (e.g. EntityNode's Fields editor). No node-type branching here.
  const shape = node.type ? getShape(node.type) : undefined;
  const customPanel = shape?.panel;
  const supportsText = node.type !== CUSTOM_IMAGE_NODE_TYPE;

  // Some node types have fewer tabs. Keep the user's last choice, but render
  // Style while that choice is not valid for the current selection.
  const visibleTab =
    (!customPanel && activeTab === 'panel') || (!supportsText && activeTab === 'text')
      ? 'style'
      : activeTab;

  // The style fields live on node.data so they survive page snapshots.
  const style = (node.data ?? {}) as NodeStyleData;
  const PanelComponent = customPanel?.component;

  const renderTab = (id: StyleTabId, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={visibleTab === id}
      className={`${TAB_CLASS} ${visibleTab === id ? 'active' : ''}`}
      onClick={() => setActiveTab(id)}
    >
      {label}
    </button>
  );

  return (
    <aside
      className="absolute top-4 z-50 flex max-h-[calc(100%-32px)] flex-col overflow-hidden rounded-xl border border-line bg-panel font-sans shadow-[0_12px_28px_rgba(0,0,0,0.08)]"
      style={{ right: FLOATING_STYLE_PANEL_RIGHT_GAP_PX, width: FLOATING_STYLE_PANEL_WIDTH_PX }}
    >
      <div className="flex flex-shrink-0 border-b border-line" role="tablist" aria-label="Node styling tabs">
        {renderTab('style', 'Style')}
        {supportsText && renderTab('text', 'Text')}
        {customPanel && renderTab('panel', customPanel.label)}
        {renderTab('arrange', 'Arrange')}
      </div>

      <div className="flex flex-col gap-5 overflow-y-auto p-[18px]">
        {visibleTab === 'style' ? (
          <StyleTab style={style} onStyleChange={onStyleChange} />
        ) : visibleTab === 'text' ? (
          <TextTab
            style={style}
            onStyleChange={onStyleChange}
            onFontPreview={onFontPreview}
            onFontPreviewEnd={onFontPreviewEnd}
          />
        ) : visibleTab === 'panel' && PanelComponent ? (
          <PanelComponent
            node={node}
            onDataChange={(patch, options) =>
              onNodeDataChange(node.id, patch, options)
            }
          />
        ) : (
          <ArrangeTab
            node={node}
            style={style}
            onStyleChange={onStyleChange}
            onPositionChange={onPositionChange}
            onSizeChange={onSizeChange}
            onBringToFront={onBringToFront}
            onSendToBack={onSendToBack}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        )}
      </div>
    </aside>
  );
}
