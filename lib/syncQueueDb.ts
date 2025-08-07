// lib/syncQueueDb.ts
import { getDb } from './database';

export type SyncQueueItem = {
  id: number;
  entity: string;
  entity_local_id?: number;
  entity_uuid?: string;
  entity_supabase_id?: number;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload?: string; // JSON string
  timestamp: number;
};

// إضافة تغيير جديد إلى قائمة المزامنة
export const addToSyncQueue = async (
  entity: string,
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  entity_uuid: string,
  payload?: any
): Promise<void> => {
  const db = getDb();
  await db.runAsync(
    `
    INSERT INTO sync_queue (entity, entity_uuid, operation, payload)
    VALUES (?, ?, ?, ?);
    `,
    [entity, entity_uuid, operation, payload ? JSON.stringify(payload) : null]
  );
};

// جلب جميع التغييرات غير المتزامنة
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


