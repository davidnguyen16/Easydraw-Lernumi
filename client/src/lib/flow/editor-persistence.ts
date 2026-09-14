/**
 * Editor persistence engine (port of Flow.svelte's sync + autosave logic).
 *
 * The Svelte editor kept this state in Flow.svelte's script; here it lives at
 * module scope because every store it touches is a global Zustand store reached
 * via getState(). The reactive triggers (canvas / metadata change → autosave)
 * run from <DiagramPersistence/>; everything else is imperative and callable
 * from the editor context (save / export / page ops).
 *
 * Three freshness layers, same as Svelte:
 *   1) flow-store  — live canvas graph
 *   2) editor-doc  — pages[] (in-memory app state)
 *   3) localStorage + cloud (PATCH /diagrams/:id, data JSONB = EditorState)
 */
import { getNodesBounds, type Node, type Edge } from '@xyflow/react';
import { useFlowStore } from '@/lib/flow/flow-store';
import {
  useEditorDoc,
  getActivePage,
  saveActivePageToStorage,
  saveFullStateToStorage,
  exportEditorStateAsJSON,
  computeVisibleUnsavedPageIds,
} from '@/lib/stores/editor-doc.store';
import { useEditorMeta } from '@/lib/stores/editor-meta.store';
import { useEditorStore } from '@/lib/stores/editor.store';
import { resetHistory, setApplyingHistory } from '@/lib/stores/history.store';
import { getExporter } from '@/lib/exporters';
import type { ExportBounds, ExportContext } from '@/lib/exporters/types';
import { getDiagramBackend } from '@/lib/backend';

// ── Module state (one editor instance at a time) ──
let baselineCanvasSignature = '';
let canvasPageId: string | null = null;
let isHydrating = false;
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
let saveGeneration = 0;
let savedMetaSignature: string | null = null;

export const getIsHydrating = () => isHydrating;
export const getCanvasPageId = () => canvasPageId;
export const getBaselineSignature = () => baselineCanvasSignature;
export const getSavedMetaSignature = () => savedMetaSignature;

export function createCanvasSignature(nodes: Node[], edges: Edge[]) {
  return JSON.stringify({ nodes, edges });
}

export function createMetaSignature() {
  const m = useEditorMeta.getState();
  return `${m.fileName}\u0000${m.status}`;
}

// JSON clone drops function refs (e.g. a duplicated node's onEdit) safely — Next
// nodes fall back to useReactFlow().updateNodeData when onEdit is absent.
function clone<T>(items: T[]): T[] {
  return JSON.parse(JSON.stringify(items)) as T[];
}

// ── Canvas ↔ store sync ──
export function persistCanvasToStore() {
  const fs = useFlowStore.getState();
  const doc = useEditorDoc.getState();
  doc.updateActiveGraph(fs.nodes, fs.edges);
  baselineCanvasSignature = createCanvasSignature(fs.nodes, fs.edges);
  if (canvasPageId) doc.clearCanvasDirtyPage(canvasPageId);
}

export function hydrateCanvasFromStore() {
  const doc = useEditorDoc.getState();
  const active = getActivePage(doc);
  const nextNodes = clone(active?.nodes ?? []);
  const nextEdges = clone(active?.edges ?? []);

  isHydrating = true;
  const fs = useFlowStore.getState();
  fs.setNodes(nextNodes);
  fs.setEdges(nextEdges);
  canvasPageId = active?.id ?? null;
  baselineCanvasSignature = createCanvasSignature(nextNodes, nextEdges);
  // Baseline the title/status here too. The metadata effect bails out while
  // hydrating and (unlike Svelte's auto-tracked $effect) never re-runs when the
  // flag clears, so if it were left to set the first baseline it would swallow
  // the user's first title or status change instead of saving it.
  savedMetaSignature = createMetaSignature();
  if (canvasPageId) doc.clearCanvasDirtyPage(canvasPageId);

  // Reset undo/redo each time we swap into a different page snapshot.
  resetHistory(baselineCanvasSignature);

  queueMicrotask(() => {
    isHydrating = false;
  });
}

// ── Page handlers (persist old → mutate → hydrate new) ──
export function handleSwitchPage(pageId: string) {
  persistCanvasToStore();
  useEditorDoc.getState().switchPage(pageId);
  hydrateCanvasFromStore();
}

export function handleCreatePage() {
  persistCanvasToStore();
  useEditorDoc.getState().createPage();
  hydrateCanvasFromStore();
}

export function handleDeletePage(pageId: string) {
  const isActive = useEditorDoc.getState().activePageId === pageId;
  useEditorDoc.getState().deletePage(pageId);
  if (isActive) hydrateCanvasFromStore();
  saveFullStateToStorage();
}

export function handleDuplicatePage(pageId: string) {
  persistCanvasToStore();
  useEditorDoc.getState().duplicatePage(pageId);
  hydrateCanvasFromStore();
  saveFullStateToStorage();
}

export function handleDeleteAllPages() {
  useEditorDoc.getState().deleteAllPages();
  hydrateCanvasFromStore();
  saveFullStateToStorage();
}

export function handleRenamePage(pageId: string, name: string) {
  useEditorDoc.getState().renamePage(pageId, name);
}

// ── Cloud save (via the active DiagramBackend) ──
async function performSave(diagramId: string, generation: number, metaSignature: string) {
  persistCanvasToStore();
  saveActivePageToStorage();

  try {
    const data = JSON.parse(exportEditorStateAsJSON());
    const meta = useEditorMeta.getState();
    await getDiagramBackend().saveDiagram(diagramId, {
      data,
      title: meta.fileName,
      status: meta.status,
    });

    // A newer edit/save may have started while this request was in flight — only
    // the newest request marks the document as saved.
    if (generation === saveGeneration) {
      savedMetaSignature = metaSignature;
      meta.setLastSaved(Date.now());
      useEditorStore.getState().setSaveStatus('saved');
    }
  } catch (e) {
    console.error('Save failed', e);
    if (generation === saveGeneration) useEditorStore.getState().setSaveStatus('error');
  }
}

export function scheduleAutosave(diagramId: string, metaSignature: string) {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  const generation = ++saveGeneration;
  useEditorStore.getState().setSaveStatus('saving');
  autosaveTimer = setTimeout(() => {
    autosaveTimer = undefined;
    void performSave(diagramId, generation, metaSignature);
  }, 1000);
}

export async function handleSave(diagramId: string) {
  // A manual save supersedes a pending debounced autosave.
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = undefined;
  const generation = ++saveGeneration;
  useEditorStore.getState().setSaveStatus('saving');
  await performSave(diagramId, generation, createMetaSignature());
}

// ── File > New / Open ──
export function handleNewFile() {
  const unsaved = computeVisibleUnsavedPageIds(useEditorDoc.getState());
  if (unsaved.length > 0) {
    const ok = window.confirm('You have unsaved changes. Discard them and start a new file?');
    if (!ok) return;
  }
  useEditorDoc.getState().resetEditorState();
  hydrateCanvasFromStore();
}

export function loadFileContent(content: string): boolean {
  const ok = useEditorDoc.getState().loadEditorStateFromJSON(content);
  if (ok) hydrateCanvasFromStore();
  return ok;
}

// ── Export ──
function getFullDiagramBounds(): ExportBounds | null {
  const { nodes, edges } = useFlowStore.getState();
  if (nodes.length === 0) return null;

  const b = getNodesBounds(nodes);
  let minX = b.x;
  let minY = b.y;
  let maxX = b.x + b.width;
  let maxY = b.y + b.height;

  // Manually-routed connections may bend outside every node — include their
  // control points so long detours are not clipped from the export.
  for (const edge of edges) {
    const bendPoints = (edge.data as { bendPoints?: { x: number; y: number }[] } | undefined)
      ?.bendPoints;
    for (const point of bendPoints ?? []) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function getExportContext(): ExportContext {
  persistCanvasToStore();
  const meta = useEditorMeta.getState();
  return {
    fileName: meta.fileName || 'easydraw',
    serializedState: exportEditorStateAsJSON(),
    canvasElement:
      typeof document !== 'undefined'
        ? (document.querySelector('.react-flow') as HTMLElement | null)
        : null,
    diagramBounds: getFullDiagramBounds(),
  };
}

// Save As = download a copy as a native .easydraw file (draw.io semantics).
export async function handleSaveAs() {
  const easydraw = getExporter('easydraw');
  if (!easydraw) return;
  await easydraw.run(getExportContext());
}

export async function handleExport(formatId: string) {
  const exporter = getExporter(formatId);
  if (!exporter) {
    window.alert(`Unknown export format: ${formatId}`);
    return;
  }
  try {
    await exporter.run(getExportContext());
  } catch (err) {
    console.error(`Export to ${exporter.label} failed:`, err);
    window.alert(`Export to ${exporter.label} failed. See console for details.`);
  }
}

// ── Undo/redo snapshot application (called by the editor context) ──
export function applyHistorySnapshot(snapshot: string) {
  try {
    const parsed = JSON.parse(snapshot) as { nodes: Node[]; edges: Edge[] };
    setApplyingHistory(true);
    isHydrating = true;
    const fs = useFlowStore.getState();
    fs.setNodes(clone(parsed.nodes));
    fs.setEdges(clone(parsed.edges));
    queueMicrotask(() => {
      setApplyingHistory(false);
      isHydrating = false;
    });
  } catch {
    // Ignore corrupt snapshot.
  }
}
