// lib/syncQueueDb.ts
import { getDb } from './database';

export const getUnsyncedChanges = async (): Promise<any[]> => {
  const db = getDb();
  // تأكد من جلب entity_uuid
  const result = await db.getAllAsync('SELECT id, entity, entity_local_id, entity_uuid, entity_supabase_id, operation, payload, timestamp FROM sync_queue ORDER BY timestamp ASC;');
  return result;
};

export const clearSyncedChange = async (id: number): Promise<void> => {
  const db = getDb();
  await db.runAsync('DELETE FROM sync_queue WHERE id = ?;', [id]);
};
