/**
 * Where the editor's cloud save goes.
 *
 * easydraw.net talks to the NestJS server (`PATCH /diagrams/:id`). Inside Lernumi
 * the same editor runs as a packaged tool that may only reach Lernumi's own
 * workspace API, so the host swaps this backend at startup. The editor code
 * (`editor-persistence.ts`) never sees the difference.
 */
import { API_URL } from '@/lib/api';
import type { DiagramStatus } from '@/lib/stores/editor-meta.store';

export type DiagramSavePayload = {
  /** EditorState as produced by `exportEditorStateAsJSON()`, already parsed. */
  data: unknown;
  title: string;
  status: DiagramStatus;
};

export type DiagramBackend = {
  saveDiagram: (diagramId: string, payload: DiagramSavePayload) => Promise<void>;
};

const nestBackend: DiagramBackend = {
  async saveDiagram(diagramId, payload) {
    const response = await fetch(`${API_URL}/diagrams/${diagramId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Save failed with status ${response.status}`);
  },
};

let current: DiagramBackend = nestBackend;

export function getDiagramBackend(): DiagramBackend {
  return current;
}

export function setDiagramBackend(backend: DiagramBackend): void {
  current = backend;
}
