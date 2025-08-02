// lib/database.ts
import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;
export const initDb = async () => {
    
  if (db) return;
  try {
    db = await SQLite.openDatabaseAsync('2.db', { useNewConnection: true });
    await db.execAsync('PRAGMA foreign_keys = ON;'); // تفعيل المفاتيح الخارجية
 
    // إنشاء جدول للمستخدمين (profiles)
await db.execAsync(`
  CREATE TABLE IF NOT EXISTS local_profiles (
    supabase_id TEXT PRIMARY KEY,
    email TEXT,
    role TEXT,
    full_name TEXT,
    avatar_url TEXT,
    password_hash TEXT,
    last_login_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

    // إنشاء جدول المستويات (levels)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS levels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        supabase_id INTEGER UNIQUE,
        is_synced INTEGER DEFAULT 0,
        operation_type TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        deleted_at TEXT
      );
    `);

    // إنشاء جدول المراكز (offices)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS offices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        supabase_id INTEGER UNIQUE,
        is_synced INTEGER DEFAULT 0,
        operation_type TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        deleted_at TEXT
      );
    `);


    // إنشاء جدول الطلاب (students)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        birth_date TEXT, -- اختياري
        phone TEXT, -- اختياري
        address TEXT, -- اختياري
        office_id INTEGER NOT NULL, -- إجباري (رابط بجدول المراكز)
        level_id INTEGER NOT NULL, -- إجباري (رابط بجدول المستويات)
        supabase_id INTEGER UNIQUE,
        is_synced INTEGER DEFAULT 0,
        operation_type TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        deleted_at TEXT,
        FOREIGN KEY (office_id) REFERENCES offices(supabase_id),
        FOREIGN KEY (level_id) REFERENCES levels(supabase_id)
      );
    `);

    // إنشاء جدول قائمة المزامنة (sync_queue) - هذا الجدول عام لجميع الكيانات
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity TEXT NOT NULL,
        entity_local_id INTEGER,
        entity_uuid TEXT,
        entity_supabase_id INTEGER,
        operation TEXT NOT NULL,
        payload TEXT,
        timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
    `);

    console.log('✅ Database and tables initialized successfully!');
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    throw error; // أعد رمي الخطأ للتعامل معه في RootLayout
  }
};

export const getDb = (): SQLite.SQLiteDatabase => {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
};

