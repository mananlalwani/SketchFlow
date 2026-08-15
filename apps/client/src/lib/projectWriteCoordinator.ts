import { createProjectOnce, updateProjectOnce } from './api';
import { NetworkError, ValidationError } from './errorHandling';
import type { JsonValue } from '@sketchflow/shared';

export interface ProjectWriteSnapshot {
  projectKey: string;
  projectId?: string;
  title: string;
  data: JsonValue;
  documentVersion: number;
  expectedRevision?: number;
  /** True only for an authenticated cloud request. */
  cloud?: boolean;
  /** Invoked at request time so queued cloud writes do not reuse stale credentials. */
  tokenProvider?: () => Promise<string | null>;
  /** Guest requests may explicitly use a null token. Never persist tokens in snapshots. */
  token?: null;
}

export interface ProjectWriteResult {
  id: string;
  revision?: number;
  data?: JsonValue;
}

export interface ProjectWriteTransport {
  create(snapshot: ProjectWriteSnapshot): Promise<ProjectWriteResult>;
  update(
    id: string,
    snapshot: ProjectWriteSnapshot,
    expectedRevision?: number,
  ): Promise<ProjectWriteResult>;
}

export interface ProjectWriteCoordinatorOptions {
  /** Delays between safe retries of a revision-checked update. */
  retryDelaysMs?: readonly number[];
  sleep?: (delayMs: number) => Promise<void>;
}

type Waiter = {
  resolve: (result: ProjectWriteResult) => void;
  reject: (reason?: Error) => void;
};

type Pending = { snapshot: ProjectWriteSnapshot; waiters: Waiter[] };
type PauseReason = 'permanent' | 'transient';
type Lane = {
  pending?: Pending;
  running: boolean;
  projectId?: string;
  revision?: number;
  paused: boolean;
  pauseReason?: PauseReason;
  generation: number;
};

/** A project load superseded a queued snapshot before it reached the server. */
export class ProjectWriteResetError extends Error {
  public constructor() {
    super('The project session changed before this save could be sent.');
    this.name = 'ProjectWriteResetError';
  }
}

/** Serializes document writes per project and retains only the newest queued snapshot. */
export class ProjectWriteCoordinator {
  private readonly lanes = new Map<string, Lane>();
  private readonly retryDelaysMs: readonly number[];
  private readonly sleep: (delayMs: number) => Promise<void>;

  public constructor(
    private readonly transport: ProjectWriteTransport,
    options: ProjectWriteCoordinatorOptions = {},
  ) {
    this.retryDelaysMs = options.retryDelaysMs ?? [200, 500];
    this.sleep =
      options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  }

  public enqueue(snapshot: ProjectWriteSnapshot): Promise<ProjectWriteResult> {
    const lane = this.lanes.get(snapshot.projectKey) ?? {
      running: false,
      paused: false,
      generation: 0,
    };
    this.lanes.set(snapshot.projectKey, lane);
    lane.projectId ??= snapshot.projectId;
    if (snapshot.expectedRevision !== undefined) {
      lane.revision = Math.max(
        lane.revision ?? snapshot.expectedRevision,
        snapshot.expectedRevision,
      );
    }

    return new Promise<ProjectWriteResult>((resolve, reject) => {
      // SAFETY: Each lane keeps the snapshot and its resolver together; only the
      // result produced for this same queued snapshot is delivered to this resolver.
      const waiter: Waiter = { resolve: resolve as Waiter['resolve'], reject };
      if (!lane.pending || snapshot.documentVersion >= lane.pending.snapshot.documentVersion) {
        const prior = lane.pending;
        lane.pending = { snapshot, waiters: prior ? [...prior.waiters, waiter] : [waiter] };
      } else {
        lane.pending.waiters.push(waiter);
      }
      // A permanent (especially 409) error stays paused until an explicit user
      // retry. Autosave and reconnect recovery may add a newer snapshot, but
      // must never silently replay a known-conflicting document.
      void this.drain(snapshot.projectKey, lane);
    });
  }

  /**
   * Discards queued snapshots from an obsolete project session. An already sent
   * request cannot be cancelled, so it is allowed to finish without advancing
   * this lane's loaded ID/revision baseline.
   */
  public reset(projectKey: string, baseline?: { projectId?: string; revision?: number }): void {
    const lane = this.lanes.get(projectKey);
    if (!lane) return;

    lane.generation += 1;
    lane.paused = false;
    lane.pauseReason = undefined;
    lane.projectId = baseline?.projectId;
    lane.revision = baseline?.revision;
    const pending = lane.pending;
    lane.pending = undefined;
    pending?.waiters.forEach((waiter) => waiter.reject(new ProjectWriteResetError()));
  }

  /**
   * Resume one lane after an explicit user retry. Reconnect recovery can opt in
   * to transient failures only; it must not retry a conflict or permission error.
   */
  public resume(projectKey?: string, options: { transientOnly?: boolean } = {}): void {
    for (const [key, lane] of this.lanes) {
      if (projectKey && key !== projectKey) continue;
      if (options.transientOnly && lane.pauseReason !== 'transient') continue;
      lane.paused = false;
      lane.pauseReason = undefined;
      if (lane.pending) void this.drain(key, lane);
    }
  }

  private async drain(key: string, lane: Lane): Promise<void> {
    if (lane.running || lane.paused || !lane.pending) return;
    lane.running = true;
    const pending = lane.pending;
    lane.pending = undefined;
    const snapshot = pending.snapshot;
    const generation = lane.generation;

    try {
      const result = lane.projectId
        ? await this.updateWithRetry(lane.projectId, snapshot, lane.revision, lane, generation)
        : await this.transport.create(snapshot);
      // A hydration can supersede this request while it is in flight. Its
      // acknowledgement still belongs to its original caller, but must not
      // replace the revision baseline fetched for the new session.
      if (lane.generation === generation) {
        lane.projectId = result.id;
        lane.revision = result.revision;
      }
      pending.waiters.forEach((waiter) => waiter.resolve(result));
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      pending.waiters.forEach((waiter) => waiter.reject(failure));
      if (lane.generation === generation) {
        lane.paused = true;
        lane.pauseReason = isTransient(failure) ? 'transient' : 'permanent';
      }
    } finally {
      lane.running = false;
      if (!lane.paused && lane.pending) void this.drain(key, lane);
    }
  }

  /**
   * A create has no idempotency key, so retrying after an ambiguous transport
   * failure could duplicate a cloud project. Updates are CAS-protected and can
   * safely receive bounded transient retries with a newly acquired token.
   */
  private async updateWithRetry(
    id: string,
    snapshot: ProjectWriteSnapshot,
    expectedRevision: number | undefined,
    lane: Lane,
    generation: number,
  ): Promise<ProjectWriteResult> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.transport.update(id, snapshot, expectedRevision);
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error));
        const delayMs = this.retryDelaysMs[attempt];
        if (delayMs === undefined || !isTransient(failure) || lane.generation !== generation) {
          throw failure;
        }
        await this.sleep(delayMs);
        // Do not dispatch a retry for a session that was hydrated while the
        // previous attempt was waiting.
        if (lane.generation !== generation) throw failure;
      }
    }
  }
}

function isTransient(error: Error): boolean {
  return (
    error instanceof NetworkError && (error.statusCode === undefined || error.statusCode >= 500)
  );
}

/** The sole in-memory coordinator used by mounted active-document save paths. */
export const activeProjectWriteCoordinator = new ProjectWriteCoordinator({
  async create(snapshot) {
    const token = await requireCloudToken(snapshot);
    const result = await createProjectOnce(snapshot.title, snapshot.data, token);
    return { id: result.id, revision: result.revision, data: result.data };
  },
  async update(id, snapshot, expectedRevision) {
    const token = await requireCloudToken(snapshot);
    const result = await updateProjectOnce(
      id,
      snapshot.title,
      snapshot.data,
      token,
      expectedRevision,
    );
    return { id: result.id, revision: result.revision, data: result.data };
  },
});

async function requireCloudToken(snapshot: ProjectWriteSnapshot): Promise<string | null> {
  if (!snapshot.cloud) return null;

  const token = await snapshot.tokenProvider?.();
  if (!token) {
    throw new ValidationError('Your cloud session expired. Sign in again before saving.');
  }
  return token;
}
