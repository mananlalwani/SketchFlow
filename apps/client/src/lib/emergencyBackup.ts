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
  await (await db()).put(STORE, backup);
}

export async function getEmergencyBackup(projectId: string) {
  return (await db()).get(STORE, projectId) as Promise<EmergencyBackup | undefined>;
}

export async function removeEmergencyBackup(projectId: string) {
  await (await db()).delete(STORE, projectId);
}
