import { openDB } from 'idb';

const DATABASE = 'sketchflow-offline-queue';
const STORE = 'operations';
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

async function db() {
  return openDB(DATABASE, 1, {
    upgrade(database) {
      const store = database.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      store.createIndex('createdAt', 'createdAt');
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
