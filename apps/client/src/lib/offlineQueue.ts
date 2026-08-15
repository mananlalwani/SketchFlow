import { openDB, type DBSchema } from 'idb';
import type { JsonValue } from '@sketchflow/shared';

const DATABASE = 'sketchflow-offline-queue';
const STORE = 'operations';
const COLLABORATION_STORE = 'collaboration-operations';
const MAX_OPERATIONS = 50;
const MAX_BYTES = 10 * 1024 * 1024;

export interface OfflineSaveOperation {
  id?: number;
  projectId: string;
  title: string;
  data: JsonValue;
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
  data: JsonValue;
  title?: string;
  createdAt: number;
  attempts: number;
}

export type NewOfflineCollaborationOperation = Omit<OfflineCollaborationOperation, 'attempts'>;

interface OfflineQueueDB extends DBSchema {
  operations: {
    key: number;
    value: OfflineSaveOperation;
    indexes: { createdAt: number };
  };
  'collaboration-operations': {
    key: string;
    value: OfflineCollaborationOperation;
    indexes: { createdAt: number; projectId: string };
  };
}

export interface OfflineQueueStorage {
  addSave(operation: OfflineSaveOperation): Promise<number>;
  getSave(id: number): Promise<OfflineSaveOperation | undefined>;
  getSaves(): Promise<OfflineSaveOperation[]>;
  putSave(operation: OfflineSaveOperation): Promise<void>;
  removeSave(id: number): Promise<void>;
  getCollaborationOperations(projectId?: string): Promise<OfflineCollaborationOperation[]>;
  putCollaborationOperation(operation: OfflineCollaborationOperation): Promise<void>;
  removeCollaborationOperation(operationId: string): Promise<void>;
}

async function createIndexedDbStorage(): Promise<OfflineQueueStorage> {
  const database = await openDB<OfflineQueueDB>(DATABASE, 2, {
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

  return {
    addSave: (operation) => database.add(STORE, operation),
    getSave: (id) => database.get(STORE, id),
    getSaves: () => database.getAllFromIndex(STORE, 'createdAt'),
    putSave: async (operation) => {
      await database.put(STORE, operation);
    },
    removeSave: async (id) => {
      await database.delete(STORE, id);
    },
    getCollaborationOperations: (projectId) =>
      projectId
        ? database.getAllFromIndex(COLLABORATION_STORE, 'projectId', projectId)
        : database.getAllFromIndex(COLLABORATION_STORE, 'createdAt'),
    putCollaborationOperation: async (operation) => {
      await database.put(COLLABORATION_STORE, operation);
    },
    removeCollaborationOperation: async (operationId) => {
      await database.delete(COLLABORATION_STORE, operationId);
    },
  };
}

export function createOfflineQueue(openStorage = createIndexedDbStorage) {
  return {
    async enqueueOfflineSave(operation: NewOfflineSaveOperation) {
      if (new Blob([JSON.stringify(operation.data)]).size > MAX_BYTES) {
        throw new Error('Offline save exceeds the 10 MB queue limit');
      }
      const storage = await openStorage();
      const existing = await storage.getSaves();
      while (existing.length >= MAX_OPERATIONS) {
        const oldest = existing.shift();
        if (oldest?.id !== undefined) await storage.removeSave(oldest.id);
      }
      return storage.addSave({ ...operation, attempts: 0 });
    },

    async getOfflineSaveQueue(): Promise<OfflineSaveOperation[]> {
      return (await openStorage()).getSaves();
    },

    async removeOfflineSave(id: number) {
      await (await openStorage()).removeSave(id);
    },

    async markOfflineSaveAttempt(id: number) {
      const storage = await openStorage();
      const operation = await storage.getSave(id);
      if (operation) await storage.putSave({ ...operation, attempts: operation.attempts + 1 });
    },

    async enqueueCollaborationOperation(operation: NewOfflineCollaborationOperation) {
      if (new Blob([JSON.stringify(operation.data)]).size > MAX_BYTES) {
        throw new Error('Offline collaboration operation exceeds the 10 MB queue limit');
      }
      const storage = await openStorage();
      const existing = await storage.getCollaborationOperations();
      if (existing.length >= MAX_OPERATIONS) throw new Error('Offline collaboration queue is full');
      await storage.putCollaborationOperation({ ...operation, attempts: 0 });
    },

    async getCollaborationOperations(projectId?: string) {
      const operations = await (await openStorage()).getCollaborationOperations(projectId);
      return operations.sort((a, b) => a.createdAt - b.createdAt);
    },

    async removeCollaborationOperation(operationId: string) {
      await (await openStorage()).removeCollaborationOperation(operationId);
    },

    async markCollaborationOperationAttempt(operationId: string) {
      const storage = await openStorage();
      const operation = (await storage.getCollaborationOperations()).find(
        (entry) => entry.operationId === operationId,
      );
      if (operation)
        await storage.putCollaborationOperation({ ...operation, attempts: operation.attempts + 1 });
    },
  };
}

const offlineQueue = createOfflineQueue();

export const {
  enqueueOfflineSave,
  getOfflineSaveQueue,
  removeOfflineSave,
  markOfflineSaveAttempt,
  enqueueCollaborationOperation,
  getCollaborationOperations,
  removeCollaborationOperation,
  markCollaborationOperationAttempt,
} = offlineQueue;
