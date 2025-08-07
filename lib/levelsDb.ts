// lib/levelsDb.ts
import { getDb } from './database';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from './supabase';

export const getLocalLevels = async (): Promise<Level[]> => {
  const db = getDb();
  const result = await db.getAllAsync(
    'SELECT * FROM levels WHERE (deleted_at IS NULL OR deleted_at = "") ORDER BY id ASC;'
  );
  return result as Level[];
};

export const insertLocalLevel = async (level: {
  name: string;
  supabase_id?: number;
}): Promise<{ localId: number; uuid: string }> => {
  const db = getDb();
  const now = new Date().toISOString();
  const newUuid = uuidv4();

  const existing = await db.getFirstAsync(
    'SELECT * FROM levels WHERE name = ? AND (deleted_at IS NULL OR deleted_at = "")',
    [level.name]
  );
  if (existing) {
    throw new Error('اسم المستوى موجود بالفعل');
  }

  const result = await db.runAsync(
    `INSERT INTO levels (uuid, name, supabase_id, is_synced, operation_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
    [
      newUuid,
      level.name,
      level.supabase_id,
      level.supabase_id ? 1 : 0,
      level.supabase_id ? null : 'INSERT',
      now,
      now
    ]
  );

  const insertId = result.lastInsertRowId as number;

  if (!level.supabase_id) {
    await db.runAsync(
      'INSERT INTO sync_queue (entity, entity_local_id, entity_uuid, operation, payload) VALUES (?, ?, ?, ?, ?);',
      ['levels', insertId, newUuid, 'INSERT', JSON.stringify({
        name: level.name,
        created_at: now,
        updated_at: now,
        uuid: newUuid
      })]
    );
  }

  return { localId: insertId, uuid: newUuid };
};

export const updateLocalLevel = async (localId: number, name: string): Promise<void> => {
  const db = getDb();
  const now = new Date().toISOString();

  const level = await db.getFirstAsync('SELECT uuid, name, supabase_id FROM levels WHERE id = ?;', [localId]);
  if (!level) throw new Error('المستوى غير موجود محلياً');

  const existing = await db.getFirstAsync(
    'SELECT * FROM levels WHERE name = ? AND id != ? AND (deleted_at IS NULL OR deleted_at = "")',
    [name, localId]
  );
  if (existing) {
    throw new Error('اسم المستوى موجود بالفعل');
  }

  await db.runAsync(
    'UPDATE levels SET name = ?, is_synced = 0, operation_type = "UPDATE", updated_at = ? WHERE id = ?;',
    [name, now, localId]
  );

  await db.runAsync(
    `INSERT OR REPLACE INTO sync_queue
     (entity, entity_local_id, entity_uuid, entity_supabase_id, operation, payload)
     VALUES (?, ?, ?, (SELECT supabase_id FROM levels WHERE id = ?), ?, ?);`,
    ['levels', localId, level.uuid, localId, 'UPDATE', JSON.stringify({
      name,
      updated_at: now,
      uuid: level.uuid
    })]
  );
};

export const deleteLocalLevel = async (localId: number): Promise<void> => {
  const db = getDb();
  const now = new Date().toISOString();

  const level = await db.getFirstAsync('SELECT uuid, supabase_id FROM levels WHERE id = ?;', [localId]);
  if (!level) throw new Error('المستوى غير موجود محلياً');

  await db.runAsync(
    'UPDATE levels SET deleted_at = ?, is_synced = 0, operation_type = "DELETE", updated_at = ? WHERE id = ?;',
    [now, now, localId]
  );

  await db.runAsync(
    'INSERT INTO sync_queue (entity, entity_local_id, entity_uuid, entity_supabase_id, operation, payload) VALUES (?, ?, ?, ?, ?, ?);',
    ['levels', localId, level.uuid, level.supabase_id ?? null, 'DELETE', JSON.stringify({
      deleted_at: now,
      updated_at: now,
      uuid: level.uuid
    })]
  );
};

export const markLevelAsSynced = async (localId: number): Promise<void> => {
  const db = getDb();
  await db.runAsync(
    'UPDATE levels SET is_synced = 1, operation_type = NULL WHERE id = ?;',
    [localId]
  );
};

export const markRemoteDeletedLocally = async (supabaseId: number, deleted_at: string) => {
  const db = getDb();
  await db.runAsync(
    'UPDATE levels SET deleted_at = ?, is_synced = 1, operation_type = NULL WHERE supabase_id = ?;',
    [deleted_at, supabaseId]
  );
};

export const updateLocalLevelSupabaseId = async (
  localId: number,
  uuid: string,
  supabaseId: number
): Promise<void> => {
  const db = getDb();
  await db.runAsync(
    'UPDATE levels SET supabase_id = ?, is_synced = 1, operation_type = NULL WHERE id = ? AND uuid = ?;',
    [supabaseId, localId, uuid]
  );
};

export const updateLocalLevelFieldsBySupabase = async (supabaseLevel: any): Promise<void> => {
  const db = getDb();
  await db.runAsync(
    'UPDATE levels SET name = ?, updated_at = ?, is_synced = 1, operation_type = NULL WHERE uuid = ?;',
    [supabaseLevel.name, supabaseLevel.updated_at || supabaseLevel.created_at, supabaseLevel.uuid]
  );
};

export const insertFromSupabaseIfNotExists = async (supabaseLevel: any): Promise<void> => {
  const db = getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO levels
      (uuid, name, supabase_id, is_synced, operation_type, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, 1, NULL, ?, ?, ?);`,
    [
      supabaseLevel.uuid,
      supabaseLevel.name,
      supabaseLevel.id,
      supabaseLevel.created_at || new Date().toISOString(),
      supabaseLevel.updated_at || supabaseLevel.created_at || new Date().toISOString(),
      supabaseLevel.deleted_at || null
    ]
  );
};

export const deleteLocalLevelByUuidAndMarkSynced = async (uuid: string): Promise<void> => {
  const db = getDb();
  await db.runAsync('DELETE FROM levels WHERE uuid = ?;', [uuid]);
  console.log(`🗑️ Deleted local level (UUID: ${uuid}) after sync failure.`);
};



export const fetchAndSyncRemoteLevels = async (): Promise<void> => { // إزالة userId كمعامل
  const db = getDb();
  try {
    // جلب جميع المستويات من Supabase (لأن RLS غير مفعلة)
    const { data: remoteLevels, error } = await supabase
      .from('levels')
      .select('*')
      // .eq('user_id', userId) // تم إزالة هذا الفلتر
      .order('id', { ascending: true });

    if (error) throw error;

    const localLevels = await getLocalLevels();

    await db.withTransactionAsync(async () => {
      for (const remoteLevel of remoteLevels) {
        if (remoteLevel.deleted_at) {
          const existingLocal = localLevels.find(l => l.uuid === remoteLevel.uuid);
          if (existingLocal && !existingLocal.deleted_at) {
            await db.runAsync(
              'UPDATE levels SET deleted_at = ?, is_synced = 1, operation_type = NULL WHERE supabase_id = ?;',
              [remoteLevel.deleted_at, remoteLevel.id]
            );
            console.log(`🗑️ Marked remote deleted level locally: ${remoteLevel.name}`);
          }
          continue;
        }

        const localLevel = localLevels.find(l => l.uuid === remoteLevel.uuid);

        if (!localLevel) {
          await db.runAsync(
            `INSERT OR IGNORE INTO levels
             (uuid, name, supabase_id, is_synced, operation_type, created_at, updated_at, deleted_at) -- إزالة user_id من هنا إذا لم يكن موجوداً في Supabase
             VALUES (?, ?, ?, 1, NULL, ?, ?, ?);`,
            [
              remoteLevel.uuid,
              remoteLevel.name,
              remoteLevel.id,
              remoteLevel.created_at || new Date().toISOString(),
              remoteLevel.updated_at || remoteLevel.created_at || new Date().toISOString(),
              remoteLevel.deleted_at || null,
              // remoteLevel.user_id || null // إزالة هذا إذا لم يتم استخدامه
            ]
          );
          console.log(`➕ Inserted new level from Supabase: ${remoteLevel.name}`);
        } else {
          const remoteUpdate = new Date(remoteLevel.updated_at || remoteLevel.created_at || 0).getTime();
          const localUpdate = new Date(localLevel.updated_at || localLevel.created_at || 0).getTime();

          if (remoteUpdate > localUpdate || localLevel.operation_type === 'INSERT') {
            await db.runAsync(
              'UPDATE levels SET name = ?, updated_at = ?, is_synced = 1, operation_type = NULL WHERE uuid = ?;',
              [remoteLevel.name, remoteLevel.updated_at || remoteLevel.created_at, remoteLevel.uuid]
            );
            console.log(`🔄 Updated local level from Supabase: ${localLevel.name}`);
          }
        }
      }
    });
    console.log('✅ تمت مزامنة المستويات البعيدة بنجاح مع المحلي.');
  } catch (error: any) {
    console.error('❌ خطأ في جلب ومزامنة المستويات البعيدة:', error.message);
    throw error;
  }
};

export type Level = {
  id: number;
  uuid: string;
  name: string;
  supabase_id?: number;
  is_synced?: number;
  operation_type?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
};