// Ported from lernumi/packages/code-editor-tool/src/platform/types.ts — the runtime API contract.
export type ToolCapability = 'files:read' | 'files:write' | 'events:append' | 'replay:read';

export type ToolDocument = {
    id: string;
    name: string;
    parentFolderId: string | null;
    entryKind: 'FILE' | 'FOLDER';
    contentHash: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    createdAt: string;
    updatedAt: string;
};

export type RuntimeContext = {
    apiVersion: 'v1';
    user: { id: string; displayName: string; avatarUrl: string | null };
    role: { id: string; roleCode: string; roleName: string; scopeType: 'INSTITUTION' | 'OFFERING' };
    tool: {
        id: string;
        code: string;
        name: string;
        description: string | null;
        version: { id: string; version: string; entry: string };
    };
    session: {
        id: string;
        mode: 'OWNER' | 'REVIEWER';
        readOnly: boolean;
        capabilities: ToolCapability[];
        startedAt: string;
        endedAt: string | null;
    };
    workspace: {
        id: string;
        name: string;
        createdAt: string;
        lastOpenedAt: string | null;
    };
    attempt: {
        id: string;
        startedAt: string;
        submittedAt: string | null;
        owner: { id: string; displayName: string; avatarUrl: string | null };
    };
    assessment: {
        id: string;
        name: string;
        description: string | null;
        weight: number;
        hurdle: boolean;
        isGroup: boolean;
        publishAt: string | null;
        dueAt: string | null;
        expectedDue: string | null;
    };
    offering: {
        id: string;
        institution: { id: string; name: string };
        subject: { code: string; name: string };
        term: { id: string; year: number; session: number };
    };
};

export type ReplaySession = {
    id: string;
    startedAt: string;
    endedAt: string | null;
    toolVersion: { id: string; version: string } | null;
    eventBatchCount: number;
    checkpoint: number;
    lastReceivedAt: string | null;
    currentRuntimeCompatible: boolean;
};

export type StoredEventBatch = {
    id: string;
    clientBatchId: string;
    seqStart: number;
    seqEnd: number;
    clientAt: string;
    receivedAt: string;
    events: unknown[];
};

export type ToolEvent = {
    schema: 1;
    type: string;
    at: string;
    [key: string]: unknown;
};

export type ApiErrorBody = {
    error?: {
        code?: string;
        message?: string;
        details?: Record<string, unknown>;
    };
};
