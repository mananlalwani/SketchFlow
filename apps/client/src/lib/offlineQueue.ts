import { openDB } from 'idb';

const DATABASE = 'sketchflow-offline-queue';
const STORE = 'operations';
const COLLABORATION_STORE = 'collaboration-operations';
const MAX_OPERATIONS = 50;
const MAX_BYTES = 10 * 1024 * 1024;

export interface OfflineSaveOperation {
  id?: number;
  projectId: string;
  title: string;
  data: unknown;
  // Optional only while reading entries created before revision-guarded saves.
  revision?: number;
  createdAt: number;
  attempts: number;
}

export type NewOfflineSaveOperation = Omit<OfflineSaveOperation, 'id' | 'attempts' | 'revision'> & {
  revision: number;
};

/** A durable, idempotent edit envelope. It intentionally contains no auth token. */
export interface OfflineCollaborationOperation {
  operationId: string;
  projectId: string;
  expectedRevision: number;
  kind: 'upsert-object' | 'delete-object' | 'batch';
  data: unknown;
  title?: string;
  createdAt: number;
  attempts: number;
}

export type NewOfflineCollaborationOperation = Omit<OfflineCollaborationOperation, 'attempts'>;

async function db() {
  return openDB(DATABASE, 2, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt');
      }
      if (!database.objectStoreNames.contains(COLLABORATION_STORE)) {
        const store = database.createObjectStore(COLLABORATION_STORE, { keyPath: 'operationId' });
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('projectId', 'projectId');
      }
    },
  });
}

export async function enqueueOfflineSave(operation: NewOfflineSaveOperation) {
  if (new Blob([JSON.stringify(operation.data)]).size > MAX_BYTES) {
    throw new Error('Offline save exceeds the 10 MB queue limit');
  }
  const database = await db();
  const existing = await database.getAllFromIndex(STORE, 'createdAt');
  while (existing.length >= MAX_OPERATIONS) {
    const oldest = existing.shift();
    if (oldest?.id !== undefined) await database.delete(STORE, oldest.id);
  }
  return database.add(STORE, { ...operation, attempts: 0 });
}

export async function getOfflineSaveQueue(): Promise<OfflineSaveOperation[]> {
  return (await (await db()).getAllFromIndex(STORE, 'createdAt')) as OfflineSaveOperation[];
}

export async function removeOfflineSave(id: number) {
  await (await db()).delete(STORE, id);
}

export async function markOfflineSaveAttempt(id: number) {
  const database = await db();
  const operation = (await database.get(STORE, id)) as OfflineSaveOperation | undefined;
  if (operation) await database.put(STORE, { ...operation, attempts: operation.attempts + 1 });
}

export async function enqueueCollaborationOperation(operation: NewOfflineCollaborationOperation) {
  if (new Blob([JSON.stringify(operation.data)]).size > MAX_BYTES) {
    throw new Error('Offline collaboration operation exceeds the 10 MB queue limit');
  }
  const database = await db();
  const existing = await database.getAllFromIndex(COLLABORATION_STORE, 'createdAt');
  // Never silently evict a user's unsynced edit. The caller surfaces this as a save failure.
  if (existing.length >= MAX_OPERATIONS) throw new Error('Offline collaboration queue is full');
  await database.put(COLLABORATION_STORE, { ...operation, attempts: 0 });
}

export async function getCollaborationOperations(projectId?: string) {
  const database = await db();
  const operations = projectId
    ? await database.getAllFromIndex(COLLABORATION_STORE, 'projectId', projectId)
    : await database.getAllFromIndex(COLLABORATION_STORE, 'createdAt');
  return (operations as OfflineCollaborationOperation[]).sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeCollaborationOperation(operationId: string) {
  await (await db()).delete(COLLABORATION_STORE, operationId);
}

export async function markCollaborationOperationAttempt(operationId: string) {
  const database = await db();
  const operation = (await database.get(
    COLLABORATION_STORE,
    operationId,
  )) as OfflineCollaborationOperation | undefined;
  if (operation) await database.put(COLLABORATION_STORE, { ...operation, attempts: operation.attempts + 1 });
}
