import { openDB, type DBSchema } from 'idb';

const DATABASE = 'sketchflow-recovery';
const STORE = 'backups';
const MAX_BYTES = 10 * 1024 * 1024;

export interface EmergencyBackup {
  projectId: string;
  title: string;
  data: string;
  timestamp: number;
}

export type EmergencyBackupSnapshot = Pick<EmergencyBackup, 'title' | 'data'>;

interface EmergencyBackupDB extends DBSchema {
  backups: { key: string; value: EmergencyBackup };
}

interface EmergencyBackupTransaction {
  store: {
    get(projectId: string): Promise<EmergencyBackup | undefined>;
    put(backup: EmergencyBackup): Promise<void>;
    delete(projectId: string): Promise<void>;
  };
  done: Promise<unknown>;
}

interface EmergencyBackupDatabase {
  transaction(storeName: typeof STORE, mode: 'readwrite'): EmergencyBackupTransaction;
  get(storeName: typeof STORE, projectId: string): Promise<EmergencyBackup | undefined>;
}

function matchesSnapshot(backup: EmergencyBackup, snapshot: EmergencyBackupSnapshot): boolean {
  return backup.title === snapshot.title && backup.data === snapshot.data;
}

async function db(): Promise<EmergencyBackupDatabase> {
  const database = await openDB<EmergencyBackupDB>(DATABASE, 1, {
    upgrade(database) {
      database.createObjectStore(STORE, { keyPath: 'projectId' });
    },
  });
  return {
    transaction: () => {
      const transaction = database.transaction(STORE, 'readwrite');
      return {
        store: {
          get: (projectId) => transaction.store.get(projectId),
          put: async (backup) => {
            await transaction.store.put(backup);
          },
          delete: async (projectId) => {
            await transaction.store.delete(projectId);
          },
        },
        done: transaction.done,
      };
    },
    get: (_storeName, projectId) => database.get(STORE, projectId),
  };
}

export function createEmergencyBackupService(
  openDatabase: () => Promise<EmergencyBackupDatabase> = db,
) {
  return {
    async save(backup: EmergencyBackup) {
      if (new Blob([backup.data]).size > MAX_BYTES) {
        throw new Error('Emergency backup exceeds the 10 MB recovery limit');
      }

      const transaction = (await openDatabase()).transaction(STORE, 'readwrite');
      const existing = await transaction.store.get(backup.projectId);
      if (!existing || existing.timestamp <= backup.timestamp) {
        await transaction.store.put(backup);
      }
      await transaction.done;
    },

    async get(projectId: string): Promise<EmergencyBackup | undefined> {
      return (await openDatabase()).get(STORE, projectId);
    },

    async remove(projectId: string, expectedSnapshot?: EmergencyBackupSnapshot) {
      const transaction = (await openDatabase()).transaction(STORE, 'readwrite');
      const existing = await transaction.store.get(projectId);
      if (!existing || !expectedSnapshot || matchesSnapshot(existing, expectedSnapshot)) {
        await transaction.store.delete(projectId);
      }
      await transaction.done;
    },
  };
}

const emergencyBackupService = createEmergencyBackupService();
export const saveEmergencyBackup = emergencyBackupService.save;
export const getEmergencyBackup = emergencyBackupService.get;
export const removeEmergencyBackup = emergencyBackupService.remove;
