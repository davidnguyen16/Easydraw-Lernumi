// Ported from lernumi/packages/code-editor-tool/src/platform/client.ts — thin client for /api/tool/v1.
import type {
    ApiErrorBody,
    ReplaySession,
    RuntimeContext,
    StoredEventBatch,
    ToolDocument,
    ToolEvent,
} from './types';

type TokenGrant = {
    token: string;
    expiresIn: number;
};

export class ToolApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string,
        readonly details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'ToolApiError';
    }
}

export interface ToolDocumentApi {
    listDocuments(parentFolderId: string | null): Promise<ToolDocument[]>;
    readDocument(documentId: string): Promise<{ bytes: Uint8Array; etag: string | null }>;
    getDocument(documentId: string): Promise<ToolDocument>;
    createDocument(input: {
        entryKind: 'FILE' | 'FOLDER';
        name: string;
        parentFolderId: string | null;
    }): Promise<ToolDocument>;
    writeDocument(documentId: string, bytes: Uint8Array, etag: string, mimeType: string): Promise<ToolDocument>;
    updateDocument(documentId: string, update: { name?: string; parentFolderId?: string | null }): Promise<ToolDocument>;
    deleteDocument(documentId: string): Promise<void>;
}

export interface ToolEventApi {
    eventCheckpoint(): Promise<{ checkpoint: number; nextSeq: number; closed: boolean }>;
    appendEvents(input: {
        batchId: string;
        seqStart: number;
        seqEnd: number;
        clientAt: string;
        events: ToolEvent[];
    }): Promise<{ checkpoint: number; duplicate: boolean }>;
}

export class ToolApiClient implements ToolDocumentApi, ToolEventApi {
    private refreshTimer: number | undefined;
    private constructor(
        private token: string,
        private readonly apiBase: URL,
    ) {}

    static fromLaunchLocation(location: Location = window.location): ToolApiClient {
        const fragment = new URLSearchParams(location.hash.slice(1));
        const token = fragment.get('lernumi_token');
        const apiVersion = fragment.get('lernumi_api');
        if (!token || apiVersion !== 'v1') {
            throw new Error('Lernumi launch credentials are missing. Reopen this tool from the assessment page.');
        }

        history.replaceState(null, '', `${location.pathname}${location.search}`);
        return new ToolApiClient(token, new URL('/api/tool/v1/', location.href));
    }

    async context(): Promise<RuntimeContext> {
        return this.json<RuntimeContext>('context');
    }

    async startTokenRefresh(expiresIn = 300): Promise<void> {
        window.clearTimeout(this.refreshTimer);
        const delay = Math.max(30, expiresIn - 60) * 1_000;
        this.refreshTimer = window.setTimeout(() => void this.refreshToken(), delay);
    }

    stopTokenRefresh(): void {
        window.clearTimeout(this.refreshTimer);
    }

    async listDocuments(parentFolderId: string | null): Promise<ToolDocument[]> {
        const documents: ToolDocument[] = [];
        let cursor: string | null = null;
        do {
            const query = new URLSearchParams({
                parentFolderId: parentFolderId ?? 'root',
                limit: '200',
            });
            if (cursor) query.set('cursor', cursor);
            const page: { documents: ToolDocument[]; nextCursor: string | null } = await this.json(
                `documents?${query}`,
            );
            documents.push(...page.documents);
            cursor = page.nextCursor;
        } while (cursor);
        return documents;
    }

    async readDocument(documentId: string): Promise<{ bytes: Uint8Array; etag: string | null }> {
        const response = await this.request(`documents/${documentId}/content`);
        return {
            bytes: new Uint8Array(await response.arrayBuffer()),
            etag: unquoteEtag(response.headers.get('etag')),
        };
    }

    async getDocument(documentId: string): Promise<ToolDocument> {
        const result = await this.json<{ document: ToolDocument }>(`documents/${documentId}`);
        return result.document;
    }

    async createDocument(input: {
        entryKind: 'FILE' | 'FOLDER';
        name: string;
        parentFolderId: string | null;
    }): Promise<ToolDocument> {
        const result = await this.json<{ document: ToolDocument }>('documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        });
        return result.document;
    }

    async writeDocument(
        documentId: string,
        bytes: Uint8Array,
        etag: string,
        mimeType: string,
    ): Promise<ToolDocument> {
        const result = await this.json<{ document: ToolDocument }>(`documents/${documentId}/content`, {
            method: 'PUT',
            headers: {
                'Content-Type': mimeType,
                'If-Match': `"${etag}"`,
            },
            body: bytes as BodyInit,
        });
        return result.document;
    }

    async updateDocument(
        documentId: string,
        update: { name?: string; parentFolderId?: string | null },
    ): Promise<ToolDocument> {
        const result = await this.json<{ document: ToolDocument }>(`documents/${documentId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(update),
        });
        return result.document;
    }

    async deleteDocument(documentId: string): Promise<void> {
        await this.json(`documents/${documentId}`, { method: 'DELETE' });
    }

    async eventCheckpoint(): Promise<{ checkpoint: number; nextSeq: number; closed: boolean }> {
        return this.json('events/checkpoint');
    }

    async appendEvents(input: {
        batchId: string;
        seqStart: number;
        seqEnd: number;
        clientAt: string;
        events: ToolEvent[];
    }): Promise<{ checkpoint: number; duplicate: boolean }> {
        return this.json('events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        });
    }

    async listReplaySessions(): Promise<ReplaySession[]> {
        const sessions: ReplaySession[] = [];
        let cursor: string | null = null;
        do {
            const query = new URLSearchParams({ limit: '100' });
            if (cursor) query.set('cursor', cursor);
            const page: { sessions: ReplaySession[]; nextCursor: string | null } = await this.json(
                `replay/sessions?${query}`,
            );
            sessions.push(...page.sessions);
            cursor = page.nextCursor;
        } while (cursor);
        return sessions;
    }

    async replayEvents(sessionId: string): Promise<StoredEventBatch[]> {
        const batches: StoredEventBatch[] = [];
        let afterSeq = -1;
        while (true) {
            const query = new URLSearchParams({ afterSeq: String(afterSeq), limit: '200' });
            const page: { batches: StoredEventBatch[]; nextAfterSeq: number | null } = await this.json(
                `replay/sessions/${sessionId}/events?${query}`,
            );
            batches.push(...page.batches);
            if (page.nextAfterSeq === null) break;
            afterSeq = page.nextAfterSeq;
        }
        return batches;
    }

    /** Idempotent; safe to fire from `pagehide` with `keepalive`. */
    closeSession(): void {
        const headers = new Headers({ Authorization: `Bearer ${this.token}` });
        void fetch(new URL('session', this.apiBase), {
            method: 'PATCH',
            headers,
            credentials: 'include',
            keepalive: true,
        }).catch(() => undefined);
    }

    private async refreshToken(): Promise<void> {
        try {
            const grant = await this.json<TokenGrant>('token', { method: 'POST' });
            this.token = grant.token;
            await this.startTokenRefresh(grant.expiresIn);
        } catch (error) {
            window.dispatchEvent(new CustomEvent('lernumi:token-expired', { detail: error }));
        }
    }

    private async json<T = unknown>(path: string, init?: RequestInit): Promise<T> {
        const response = await this.request(path, init);
        if (response.status === 204) return undefined as T;
        return response.json() as Promise<T>;
    }

    private async request(path: string, init: RequestInit = {}): Promise<Response> {
        const headers = new Headers(init.headers);
        headers.set('Authorization', `Bearer ${this.token}`);
        const response = await fetch(new URL(path, this.apiBase), {
            ...init,
            headers,
            credentials: 'include',
            cache: 'no-store',
        });
        if (response.ok) return response;

        const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
        throw new ToolApiError(
            response.status,
            body?.error?.code ?? 'HTTP_ERROR',
            body?.error?.message ?? `Lernumi API returned ${response.status}`,
            body?.error?.details,
        );
    }
}

export function unquoteEtag(value: string | null): string | null {
    if (!value) return null;
    return value.trim().replace(/^W\//, '').replace(/^"|"$/g, '');
}
