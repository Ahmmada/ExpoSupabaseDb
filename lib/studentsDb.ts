// lib/studentsDb.ts
import { getDb } from './database';
import { v4 as uuidv4 } from 'uuid';

export type Student = {
  id: number;
  uuid: string;
  name: string;
  birth_date?: string;
  phone?: string;
  address?: string;
  office_id: number;
  level_id: number;
  office_name?: string;
  level_name?: string;
  supabase_id?: number;
  is_synced?: number;
  operation_type?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
};

export const getLocalStudents = async (): Promise<Student[]> => {
  const db = getDb();
  return await db.getAllAsync<Student>(`
    SELECT s.*, 
           o.name as office_name, 
           l.name as level_name 
    FROM students s
    LEFT JOIN offices o ON s.office_id = o.supabase_id
    LEFT JOIN levels l ON s.level_id = l.supabase_id
    WHERE (s.deleted_at IS NULL OR s.deleted_at = '') 
    ORDER BY s.id ASC;
  `);
};

export const insertLocalStudent = async (student: {
  name: string;
  birth_date?: string;
  phone?: string;
  address?: string;
  office_id: number;
  level_id: number;
  supabase_id?: number;
}) => {
  const db = getDb();
  return await db.withTransactionAsync(async () => {
    const now = new Date().toISOString();
    const newUuid = uuidv4();

    const existing = await db.getFirstAsync(
      'SELECT * FROM students WHERE name = ? AND office_id = ? AND level_id = ? AND (deleted_at IS NULL OR deleted_at = "")',
      [student.name, student.office_id, student.level_id]
    );

    if (existing) {
      throw new Error('اسم الطالب موجود بالفعل في هذا المركز والمستوى');
    }

    const result = await db.runAsync(
      `INSERT INTO students (uuid, name, birth_date, phone, address, office_id, level_id, supabase_id, is_synced, operation_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newUuid,
        student.name,
        student.birth_date || null,
        student.phone || null,
        student.address || null,
        student.office_id,
        student.level_id,
        student.supabase_id || null,
        student.supabase_id ? 1 : 0,
        student.supabase_id ? null : 'INSERT',
        now,
        now,
      ]
    );

    const insertId = result.lastInsertRowId as number;

    if (!student.supabase_id) {
      await db.runAsync(
        `INSERT INTO sync_queue (entity, entity_local_id, entity_uuid, operation, payload)
         VALUES (?, ?, ?, ?, ?)`,
        [
          'students',
          insertId,
          newUuid,
          'INSERT',
          JSON.stringify({
            name: student.name,
            birth_date: student.birth_date,
            phone: student.phone,
            address: student.address,
            office_id: student.office_id,
            level_id: student.level_id,
            created_at: now,
            updated_at: now,
            uuid: newUuid,
          }),
        ]
      );
    }

    return { localId: insertId, uuid: newUuid };
  });
};

export const updateLocalStudent = async (
  localId: number,
  student: {
    name: string;
    birth_date?: string;
    phone?: string;
    address?: string;
    office_id: number;
    level_id: number;
  }
) => {
  const db = getDb();
  return await db.withTransactionAsync(async () => {
    const now = new Date().toISOString();

    const existingStudent = await db.getFirstAsync<{ uuid: string; supabase_id?: number }>(
      'SELECT uuid, supabase_id FROM students WHERE id = ?',
      [localId]
    );

    if (!existingStudent) throw new Error('الطالب غير موجود محلياً');

    const existingName = await db.getFirstAsync(
      'SELECT * FROM students WHERE name = ? AND id != ? AND (deleted_at IS NULL OR deleted_at = "")',
      [student.name, localId]
    );

    if (existingName) {
      throw new Error('اسم الطالب موجود بالفعل');
    }

    await db.runAsync(
      `UPDATE students SET name = ?, birth_date = ?, phone = ?, address = ?, office_id = ?, level_id = ?, is_synced = 0, operation_type = "UPDATE", updated_at = ? WHERE id = ?`,
      [
        student.name,
        student.birth_date || null,
        student.phone || null,
        student.address || null,
        student.office_id,
        student.level_id,
        now,
        localId,
      ]
    );

    await db.runAsync(
      `INSERT OR REPLACE INTO sync_queue
       (entity, entity_local_id, entity_uuid, entity_supabase_id, operation, payload)
       VALUES (?, ?, ?, (SELECT supabase_id FROM students WHERE id = ?), ?, ?)`,
      [
        'students',
        localId,
        existingStudent.uuid,
        localId,
        'UPDATE',
        JSON.stringify({
          name: student.name,
          birth_date: student.birth_date,
          phone: student.phone,
          address: student.address,
          office_id: student.office_id,
          level_id: student.level_id,
          updated_at: now,
          uuid: existingStudent.uuid,
        }),
      ]
    );
  });
};

export const deleteLocalStudent = async (localId: number) => {
  const db = getDb();
  return await db.withTransactionAsync(async () => {
    const now = new Date().toISOString();

    const student = await db.getFirstAsync<{ uuid: string; supabase_id?: number }>(
      'SELECT uuid, supabase_id FROM students WHERE id = ?',
      [localId]
    );

    if (!student) throw new Error('الطالب غير موجود محلياً');

    await db.runAsync(
      `UPDATE students SET deleted_at = ?, is_synced = 0, operation_type = "DELETE", updated_at = ? WHERE id = ?`,
      [now, now, localId]
    );

    await db.runAsync(
      `INSERT INTO sync_queue (entity, entity_local_id, entity_uuid, entity_supabase_id, operation, payload)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        'students',
        localId,
        student.uuid,
        student.supabase_id || null,
        'DELETE',
        JSON.stringify({
          deleted_at: now,
          updated_at: now,
          uuid: student.uuid,
        }),
      ]
    );
  });
};

export const markStudentAsSynced = async (localId: number) => {
  const db = getDb();
  await db.runAsync(`UPDATE students SET is_synced = 1, operation_type = NULL WHERE id = ?`, [localId]);
};

export const markRemoteDeletedLocally = async (supabaseId: number, deleted_at: string) => {
  const db = getDb();
  await db.runAsync(
    `UPDATE students SET deleted_at = ?, is_synced = 1, operation_type = NULL WHERE supabase_id = ?`,
    [deleted_at, supabaseId]
  );
};

export const updateLocalStudentSupabaseId = async (
  localId: number,
  uuid: string,
  supabaseId: number
) => {
  const db = getDb();
  await db.runAsync(
    `UPDATE students SET supabase_id = ?, is_synced = 1, operation_type = NULL WHERE id = ? AND uuid = ?`,
    [supabaseId, localId, uuid]
  );
};

export const updateLocalStudentFieldsBySupabase = async (supabaseStudent: any) => {
  const db = getDb();
  await db.runAsync(
    `UPDATE students
     SET name = ?, birth_date = ?, phone = ?, address = ?, office_id = ?, level_id = ?, updated_at = ?, is_synced = 1, operation_type = NULL
     WHERE uuid = ? AND (deleted_at IS NULL OR deleted_at = '')`,
    [
      supabaseStudent.name,
      supabaseStudent.birth_date,
      supabaseStudent.phone,
      supabaseStudent.address,
      supabaseStudent.office_id,
      supabaseStudent.level_id,
      supabaseStudent.updated_at || supabaseStudent.created_at,
      supabaseStudent.uuid,
    ]
  );
};

export const insertFromSupabaseIfNotExists = async (supabaseStudent: any) => {
  const db = getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO students
     (uuid, name, birth_date, phone, address, office_id, level_id, supabase_id, is_synced, operation_type, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?, ?)`,
    [
      supabaseStudent.uuid,
      supabaseStudent.name,
      supabaseStudent.birth_date,
      supabaseStudent.phone,
      supabaseStudent.address,
      supabaseStudent.office_id,
      supabaseStudent.level_id,
      supabaseStudent.id,
      supabaseStudent.created_at || new Date().toISOString(),
      supabaseStudent.updated_at || supabaseStudent.created_at || new Date().toISOString(),
      supabaseStudent.deleted_at || null,
    ]
  );
};

export const deleteLocalStudentByUuidAndMarkSynced = async (uuid: string): Promise<void> => {
  const db = getDb();
  await db.runAsync('DELETE FROM students WHERE uuid = ?', [uuid]);
  console.log(`🗑️ Deleted local student (UUID: ${uuid}) after sync failure.`);
};