import { openDB } from 'idb';

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

function matchesSnapshot(backup: EmergencyBackup, snapshot: EmergencyBackupSnapshot): boolean {
  return backup.title === snapshot.title && backup.data === snapshot.data;
}

async function db() {
  return openDB(DATABASE, 1, {
    upgrade(database) {
      database.createObjectStore(STORE, { keyPath: 'projectId' });
    },
  });
}

export async function saveEmergencyBackup(backup: EmergencyBackup) {
  if (new Blob([backup.data]).size > MAX_BYTES) {
    throw new Error('Emergency backup exceeds the 10 MB recovery limit');
  }

  const transaction = (await db()).transaction(STORE, 'readwrite');
  const existing = (await transaction.store.get(backup.projectId)) as EmergencyBackup | undefined;
  if (!existing || existing.timestamp <= backup.timestamp) {
    await transaction.store.put(backup);
  }
  await transaction.done;
}

export async function getEmergencyBackup(projectId: string) {
  return (await db()).get(STORE, projectId) as Promise<EmergencyBackup | undefined>;
}

export async function removeEmergencyBackup(
  projectId: string,
  expectedSnapshot?: EmergencyBackupSnapshot,
) {
  const transaction = (await db()).transaction(STORE, 'readwrite');
  const existing = (await transaction.store.get(projectId)) as EmergencyBackup | undefined;
  if (!existing || !expectedSnapshot || matchesSnapshot(existing, expectedSnapshot)) {
    await transaction.store.delete(projectId);
  }
  await transaction.done;
}
