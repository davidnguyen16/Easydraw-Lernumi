// Shared drag source for palette → canvas drops (replaces the Svelte DnD
// context). NodeContainer parks the dragged shape id here on dragstart; the
// canvas onDrop reads it, looks it up in the registry, and creates the node.
export type PaletteDragPayload = { kind: 'shape'; shapeId: string };

export const dndState: { current: PaletteDragPayload | null } = { current: null };

export const EASYDRAW_DND_MIME = 'application/x-easydraw-node';

export function setDragPayload(
  dataTransfer: DataTransfer,
  payload: PaletteDragPayload,
): void {
  dndState.current = payload;
  dataTransfer.effectAllowed = 'copy';
  dataTransfer.setData(EASYDRAW_DND_MIME, JSON.stringify(payload));
  // A text fallback makes the drag valid in browsers that ignore custom MIME
  // types until the drop event.
  dataTransfer.setData('text/plain', payload.kind);
}

export function readDragPayload(
  dataTransfer: DataTransfer,
): PaletteDragPayload | null {
  const serialized = dataTransfer.getData(EASYDRAW_DND_MIME);
  if (serialized) {
    try {
      const parsed = JSON.parse(serialized) as PaletteDragPayload;
      if (parsed?.kind === 'shape') return parsed;
    } catch {
      // Fall back to the in-memory payload below.
    }
  }
  return dndState.current;
}

export function clearDragPayload(): void {
  dndState.current = null;
}
