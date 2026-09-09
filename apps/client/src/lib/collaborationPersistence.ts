import type { CollaborationCommit, CollaborationCommitResult } from '@/types/socket';
import type {
  NewOfflineCollaborationOperation,
  OfflineCollaborationOperation,
} from './offlineQueue';

/** User-visible state for one project's durable collaboration lane. */
export type CollaborationSyncStatus =
  | 'saved-locally'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'retrying'
  | 'conflict'
  | 'error';

export interface CollaborationPersistenceQueue {
  enqueueCollaborationOperation(operation: NewOfflineCollaborationOperation): Promise<void>;
  getCollaborationOperations(projectId?: string): Promise<OfflineCollaborationOperation[]>;
  removeCollaborationOperation(operationId: string): Promise<void>;
  markCollaborationOperationAttempt(operationId: string): Promise<void>;
}

export interface CollaborationPersistenceOptions {
  queue: CollaborationPersistenceQueue;
  send: (operation: CollaborationCommit) => Promise<CollaborationCommitResult>;
  onStatus?: (status: CollaborationSyncStatus) => void;
}

export interface CanonicalApplyGuardInput {
  hasUnsavedChanges: boolean;
  pendingOperationCount: number;
}

/**
 * Canonical hydration is safe only after local work has been acknowledged.
 * Keeping this as a pure predicate makes it usable by both the canvas adapter
 * and browser/reload integration tests without allowing a remote snapshot to
 * silently erase a local draft.
 */
export function canApplyCanonicalProject({
  hasUnsavedChanges,
  pendingOperationCount,
}: CanonicalApplyGuardInput): boolean {
  return !hasUnsavedChanges && pendingOperationCount === 0;
}

function toCommit(
  operation: OfflineCollaborationOperation | NewOfflineCollaborationOperation,
): CollaborationCommit {
  return {
    protocolVersion: 1,
    projectId: operation.projectId,
    operationId: operation.operationId,
    expectedRevision: operation.expectedRevision,
    kind: operation.kind,
    data: operation.data,
    title: operation.title,
  };
}

function isSuccessful(result: CollaborationCommitResult): boolean {
  return result.status === 'applied' || result.status === 'duplicate';
}

/**
 * Durable-first collaboration delivery.
 *
 * Every operation is written to the queue before the transport is called. A
 * transport failure leaves that operation in the queue for a later replay;
 * only an applied or duplicate acknowledgement removes it. This is the seam
 * for browser restart and fake-socket integration tests.
 */
export class CollaborationPersistence {
  private connected = false;
  private replaying = false;
  private status: CollaborationSyncStatus = 'offline';
  private readonly deliveries = new Map<string, Promise<CollaborationCommitResult>>();

  public constructor(private readonly options: CollaborationPersistenceOptions) {}

  public getStatus(): CollaborationSyncStatus {
    return this.status;
  }

  public setConnected(connected: boolean): void {
    this.connected = connected;
    if (!connected) {
      // A socket callback may never arrive after a disconnect. Allow a later
      // reconnect to issue the idempotent operation again instead of waiting
      // on that abandoned promise.
      this.deliveries.clear();
      this.setStatus('offline');
    }
  }

  public async persist(
    operation: NewOfflineCollaborationOperation,
  ): Promise<CollaborationCommitResult | undefined> {
    // This await is intentional: no socket emission is allowed before the
    // IndexedDB write has completed successfully.
    try {
      await this.options.queue.enqueueCollaborationOperation(operation);
    } catch (error) {
      this.setStatus('error');
      throw error;
    }

    if (!this.connected) {
      this.setStatus('saved-locally');
      return undefined;
    }

    return this.deliverOnce(operation);
  }

  public async replay(projectId?: string): Promise<CollaborationCommitResult[]> {
    if (!this.connected || this.replaying) return [];
    this.replaying = true;
    const results: CollaborationCommitResult[] = [];
    try {
      const operations = await this.options.queue.getCollaborationOperations(projectId);
      for (const operation of operations) {
        if (!this.connected) break;
        results.push(await this.deliverOnce(operation, true));
      }
      return results;
    } finally {
      this.replaying = false;
    }
  }

  public async getPendingOperationCount(projectId?: string): Promise<number> {
    return (await this.options.queue.getCollaborationOperations(projectId)).length;
  }

  private async deliverOnce(
    operation: OfflineCollaborationOperation | NewOfflineCollaborationOperation,
    isReplay = false,
  ): Promise<CollaborationCommitResult> {
    const existing = this.deliveries.get(operation.operationId);
    if (existing) return existing;

    const delivery = this.deliver(operation, isReplay);
    this.deliveries.set(operation.operationId, delivery);
    try {
      return await delivery;
    } finally {
      this.deliveries.delete(operation.operationId);
    }
  }

  private async deliver(
    operation: OfflineCollaborationOperation | NewOfflineCollaborationOperation,
    isReplay: boolean,
  ): Promise<CollaborationCommitResult> {
    this.setStatus(isReplay ? 'retrying' : 'syncing');
    try {
      const result = await this.options.send(toCommit(operation));
      if (isSuccessful(result)) {
        await this.options.queue.removeCollaborationOperation(operation.operationId);
        this.setStatus('synced');
      } else if (result.status === 'conflict') {
        await this.options.queue.markCollaborationOperationAttempt(operation.operationId);
        this.setStatus('conflict');
      } else if (result.status === 'unavailable') {
        await this.options.queue.markCollaborationOperationAttempt(operation.operationId);
        this.setStatus('retrying');
      } else {
        await this.options.queue.markCollaborationOperationAttempt(operation.operationId);
        this.setStatus('error');
      }
      return result;
    } catch (error) {
      await this.options.queue.markCollaborationOperationAttempt(operation.operationId);
      this.setStatus('retrying');
      throw error;
    }
  }

  private setStatus(status: CollaborationSyncStatus): void {
    this.status = status;
    this.options.onStatus?.(status);
  }
}
