/**
 * Diagrams on top of Lernumi workspace documents.
 *
 * easydraw.net keeps diagrams as rows in its own database. Inside Lernumi the
 * student's work must live in the assessment attempt's workspace, so every
 * diagram becomes one `<title>.easydraw` file at the workspace root — the same
 * XML envelope "Save As" downloads, which means a marker can open the file in
 * easydraw.net as well. Title, status and diagram type travel inside the JSON.
 *
 * The document list only carries names and content hashes, so the dashboard
 * reads each file once and caches the parsed header by hash.
 */
import { parseEasyDraw, serializeEasyDraw } from '@/lib/exporters/easydraw';
import type { DiagramStatus } from '@/lib/stores/editor-meta.store';
import { ToolApiError, type ToolApiClient } from './platform/client';
import type { ToolDocument } from './platform/types';

export const DIAGRAM_EXTENSION = '.easydraw';
const MIME_TYPE = 'application/xml';

export type DiagramSummary = {
  id: string;
  title: string;
  type: string;
  status: DiagramStatus;
  updatedAt: string;
};

/** JSON payload inside the envelope. `pages`/`activePageId` belong to the editor. */
type DiagramFile = {
  fileName?: string;
  status?: string;
  type?: string;
  pages?: unknown;
  activePageId?: unknown;
  [key: string]: unknown;
};

type CacheEntry = { hash: string | null; file: DiagramFile; document: ToolDocument };

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function normalizeStatus(status: unknown): DiagramStatus {
  return status === 'complete' || status === 'archived' ? status : 'draft';
}

function titleFromDocument(document: ToolDocument): string {
  return document.name.endsWith(DIAGRAM_EXTENSION)
    ? document.name.slice(0, -DIAGRAM_EXTENSION.length)
    : document.name;
}

/** File names are shown in Lernumi's own explorer, so keep them readable but safe. */
export function fileNameFor(title: string): string {
  const safe = title
    .replace(/[\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return `${safe || 'Untitled'}${DIAGRAM_EXTENSION}`;
}

function parseFile(bytes: Uint8Array): DiagramFile {
  const text = decoder.decode(bytes);
  if (!text.trim()) return {};
  try {
    const json = parseEasyDraw(text) ?? text;
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as DiagramFile) : {};
  } catch {
    return {};
  }
}

function serializeFile(file: DiagramFile): Uint8Array {
  return encoder.encode(serializeEasyDraw(JSON.stringify(file, null, 2)));
}

export class LernumiDiagrams {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly client: ToolApiClient) {}

  private summarize(entry: CacheEntry): DiagramSummary {
    return {
      id: entry.document.id,
      title: entry.file.fileName?.trim() || titleFromDocument(entry.document),
      type: typeof entry.file.type === 'string' ? entry.file.type : 'erd',
      status: normalizeStatus(entry.file.status),
      updatedAt: entry.document.updatedAt,
    };
  }

  private async load(document: ToolDocument): Promise<CacheEntry> {
    const cached = this.cache.get(document.id);
    if (cached && cached.hash === document.contentHash) {
      cached.document = document;
      return cached;
    }
    const { bytes, etag } = await this.client.readDocument(document.id);
    const entry: CacheEntry = { hash: etag ?? document.contentHash, file: parseFile(bytes), document };
    this.cache.set(document.id, entry);
    return entry;
  }

  async list(): Promise<DiagramSummary[]> {
    const documents = await this.client.listDocuments(null);
    const files = documents.filter(
      (document) => document.entryKind === 'FILE' && document.name.endsWith(DIAGRAM_EXTENSION),
    );
    const entries = await Promise.all(files.map((document) => this.load(document)));
    return entries.map((entry) => this.summarize(entry));
  }

  /** Full content for the editor. Returns null when the file is gone. */
  async open(diagramId: string): Promise<{ summary: DiagramSummary; file: DiagramFile } | null> {
    let document: ToolDocument;
    try {
      const result = await this.client.getDocument(diagramId);
      document = result;
    } catch (error) {
      if (error instanceof ToolApiError && error.status === 404) return null;
      throw error;
    }
    const entry = await this.load(document);
    return { summary: this.summarize(entry), file: entry.file };
  }

  async create(input: { title: string; type: string; file?: DiagramFile }): Promise<DiagramSummary> {
    const file: DiagramFile = {
      ...(input.file ?? {}),
      fileName: input.title,
      type: input.type,
      status: normalizeStatus(input.file?.status),
    };
    const document = await this.createNamed(fileNameFor(input.title));
    const written = await this.client.writeDocument(
      document.id,
      serializeFile(file),
      document.contentHash ?? '',
      MIME_TYPE,
    );
    const entry: CacheEntry = { hash: written.contentHash, file, document: written };
    this.cache.set(written.id, entry);
    return this.summarize(entry);
  }

  /** Sibling names are unique per folder; retry with a numeric suffix on 409. */
  private async createNamed(name: string): Promise<ToolDocument> {
    const stem = name.slice(0, -DIAGRAM_EXTENSION.length);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = attempt === 0 ? name : `${stem} (${attempt + 1})${DIAGRAM_EXTENSION}`;
      try {
        return await this.client.createDocument({ entryKind: 'FILE', name: candidate, parentFolderId: null });
      } catch (error) {
        if (!(error instanceof ToolApiError && error.status === 409)) throw error;
      }
    }
    throw new Error('Could not find a free file name for this diagram');
  }

  /**
   * Autosave target. `data` is the editor state (already carrying fileName and
   * status); `title` doubles as the file name, so a rename in the MenuBar also
   * renames the workspace file when the name is free.
   */
  async save(
    diagramId: string,
    payload: { data: unknown; title: string; status: DiagramStatus },
  ): Promise<void> {
    const previous = this.cache.get(diagramId);
    const type = previous?.file.type ?? 'erd';
    const data = payload.data && typeof payload.data === 'object' ? (payload.data as DiagramFile) : {};
    const file: DiagramFile = { ...data, fileName: payload.title, status: payload.status, type };
    const bytes = serializeFile(file);

    let etag = previous?.hash ?? null;
    if (!etag) {
      const current = await this.client.getDocument(diagramId);
      etag = current.contentHash ?? '';
    }

    let written: ToolDocument;
    try {
      written = await this.client.writeDocument(diagramId, bytes, etag, MIME_TYPE);
    } catch (error) {
      // Another tab wrote in between. The workspace belongs to one student, so
      // the newest edit wins; surface it in the console rather than losing it.
      if (!(error instanceof ToolApiError && error.status === 412)) throw error;
      const currentHash = String(error.details?.currentContentHash ?? '');
      console.warn('Diagram changed elsewhere; overwriting with this tab’s version');
      written = await this.client.writeDocument(diagramId, bytes, currentHash, MIME_TYPE);
    }

    const wantedName = fileNameFor(payload.title);
    if (written.name !== wantedName) {
      try {
        written = await this.client.updateDocument(diagramId, { name: wantedName });
      } catch (error) {
        // Name taken by a sibling: keep the old file name, the title inside is what counts.
        if (!(error instanceof ToolApiError && error.status === 409)) throw error;
      }
    }

    this.cache.set(diagramId, { hash: written.contentHash, file, document: written });
  }

  async rename(diagramId: string, title: string): Promise<void> {
    const entry = this.cache.get(diagramId) ?? (await this.load(await this.client.getDocument(diagramId)));
    await this.save(diagramId, {
      data: entry.file,
      title,
      status: normalizeStatus(entry.file.status),
    });
  }

  async duplicate(diagramId: string): Promise<DiagramSummary> {
    const entry = this.cache.get(diagramId) ?? (await this.load(await this.client.getDocument(diagramId)));
    const summary = this.summarize(entry);
    return this.create({ title: `${summary.title} (copy)`, type: summary.type, file: entry.file });
  }

  async remove(diagramId: string): Promise<void> {
    await this.client.deleteDocument(diagramId);
    this.cache.delete(diagramId);
  }
}
