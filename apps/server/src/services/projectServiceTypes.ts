import type { JsonValue } from '@sketchflow/shared';
import type { CollaborationCommitKind } from '../lib/collaborationDocument.js';

export type { CollaborationCommitKind };

export interface CollaborationCommitInput {
  projectId: string;
  userId: string;
  operationId: string;
  expectedRevision: number;
  data: JsonValue;
  title?: string;
  kind: CollaborationCommitKind;
}

export type CollaborationCommitResult =
  | {
      status: 'applied';
      operationId: string;
      revision: number;
      data: JsonValue;
      title: string;
    }
  | {
      status: 'duplicate';
      operationId: string;
      revision: number;
      data?: JsonValue;
      title?: string;
    }
  | {
      status: 'conflict';
      operationId: string;
      currentRevision: number;
    }
  | { status: 'forbidden' | 'not_found' | 'invalid'; operationId: string };

export interface ProjectHistorySnapshotRecord {
  id: string;
  revision: number;
  title: string;
  createdAt: number;
  contentHash: string;
}

export type ProjectRestoreResult =
  | { status: 'applied'; operationId: string; revision: number; data: JsonValue; title: string }
  | { status: 'conflict'; currentRevision: number }
  | { status: 'forbidden' | 'not_found' | 'invalid' };

export interface ProjectRecord {
  id: string;
  userId: string;
  title: string;
  updatedAt: number;
  createdAt: number;
  data: JsonValue;
  revision?: number;
  shared?: boolean;
  shareToken?: string;
  shareExpiresAt?: number;
  folderId?: string | null;
  role?: 'owner' | 'editor' | 'viewer';
  collaborators?: { userId: string; role: string }[];
}

/** Minimal representation safe to return to anyone holding a public share link. */
export interface PublicProjectRecord {
  id: string;
  title: string;
  updatedAt: number;
  createdAt: number;
  data: JsonValue;
  revision: number;
  shared: true;
  shareExpiresAt?: number;
  role: 'viewer';
}
