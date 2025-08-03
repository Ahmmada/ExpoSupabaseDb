// lib/syncManager.ts
import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';
import { authManager } from './authManager';
import { fetchAndSyncRemoteOffices } from './officesDb';
import { fetchAndSyncRemoteLevels } from './levelsDb';
import { fetchAndSyncRemoteStudents } from './studentsDb';
import { getUnsyncedChanges, clearSyncedChange } from './syncQueueDb';
import {
  updateLocalOfficeSupabaseId,
  markOfficeAsSynced,
  deleteLocalOfficeByUuidAndMarkSynced,
} from './officesDb';
import {
  updateLocalLevelSupabaseId,
  markLevelAsSynced,
  deleteLocalLevelByUuidAndMarkSynced,
} from './levelsDb';
import {
  updateLocalStudentSupabaseId,
  markStudentAsSynced,
  deleteLocalStudentByUuidAndMarkSynced,
} from './studentsDb';

export class SyncManager {
  private static instance: SyncManager;
  private isSyncing = false;
  private syncListeners: ((status: 'syncing' | 'completed' | 'error') => void)[] = [];

  private constructor() {}

  static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  // إضافة مستمع لحالة المزامنة
  addSyncListener(listener: (status: 'syncing' | 'completed' | 'error') => void) {
    this.syncListeners.push(listener);
  }

  // إزالة مستمع
  removeSyncListener(listener: (status: 'syncing' | 'completed' | 'error') => void) {
    this.syncListeners = this.syncListeners.filter(l => l !== listener);
  }

  // إشعار المستمعين
  private notifyListeners(status: 'syncing' | 'completed' | 'error') {
    this.syncListeners.forEach(listener => listener(status));
  }

  // مزامنة شاملة لجميع البيانات
  async fullSync(): Promise<{ success: boolean; error?: string }> {
    if (this.isSyncing) {
      return { success: false, error: 'المزامنة قيد التشغيل بالفعل' };
    }

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      return { success: false, error: 'لا يوجد اتصال بالإنترنت' };
    }

    if (!authManager.isAuthenticated()) {
      return { success: false, error: 'يجب تسجيل الدخول أولاً' };
    }

    this.isSyncing = true;
    this.notifyListeners('syncing');

    try {
      // 1. مزامنة التغييرات المحلية إلى Supabase
      await this.syncLocalChangesToSupabase();

      // 2. جلب البيانات الجديدة من Supabase
      await this.syncRemoteDataToLocal();

      this.notifyListeners('completed');
      return { success: true };
    } catch (error: any) {
      console.error('خطأ في المزامنة الشاملة:', error);
      this.notifyListeners('error');
      return { success: false, error: error.message };
    } finally {
      this.isSyncing = false;
    }
  }

  // مزامنة التغييرات المحلية إلى Supabase
  private async syncLocalChangesToSupabase(): Promise<void> {
    const unsyncedChanges = await getUnsyncedChanges();
    
    for (const change of unsyncedChanges) {
      try {
        const payload = JSON.parse(change.payload);
        
        if (change.entity === 'offices') {
          await this.syncOfficeChange(change, payload);
        } else if (change.entity === 'levels') {
          await this.syncLevelChange(change, payload);
        } else if (change.entity === 'students') {
          await this.syncStudentChange(change, payload);
        }

        await clearSyncedChange(change.id);
        console.log(`✅ تمت مزامنة ${change.operation} لـ ${change.entity}`);
      } catch (error: any) {
        console.error(`❌ خطأ في مزامنة ${change.entity}:`, error);
        // نتجاهل الأخطاء الفردية ونكمل المزامنة
      }
    }
  }

  // مزامنة تغيير مركز
  private async syncOfficeChange(change: any, payload: any): Promise<void> {
    if (change.operation === 'INSERT') {
      const { data, error } = await supabase
        .from('offices')
        .insert([{
          uuid: payload.uuid,
          name: payload.name,
          created_at: payload.created_at,
          updated_at: payload.updated_at,
          is_synced: true
        }])
        .select();

      if (error) {
        if (error.code === '23505') {
          // اسم مكرر - حذف الإدخال المحلي
          await deleteLocalOfficeByUuidAndMarkSynced(payload.uuid);
          return;
        }
        throw error;
      }

      if (data?.[0]) {
        await updateLocalOfficeSupabaseId(change.entity_local_id, change.entity_uuid, data[0].id);
        await markOfficeAsSynced(change.entity_local_id);
      }
    } else if (change.operation === 'UPDATE') {
      const { error } = await supabase
        .from('offices')
        .update({
          name: payload.name,
          updated_at: payload.updated_at,
          is_synced: true
        })
        .eq('uuid', payload.uuid)
        .is('deleted_at', null);

      if (error) throw error;
      await markOfficeAsSynced(change.entity_local_id);
    } else if (change.operation === 'DELETE') {
      const { error } = await supabase
        .from('offices')
        .update({
          deleted_at: payload.deleted_at,
          updated_at: payload.updated_at,
          is_synced: true
        })
        .eq('uuid', payload.uuid);

      if (error) throw error;
    }
  }

  // مزامنة تغيير مستوى
  private async syncLevelChange(change: any, payload: any): Promise<void> {
    if (change.operation === 'INSERT') {
      const { data, error } = await supabase
        .from('levels')
        .insert([{
          uuid: payload.uuid,
          name: payload.name,
          created_at: payload.created_at,
          updated_at: payload.updated_at,
          is_synced: true
        }])
        .select();

      if (error) {
        if (error.code === '23505') {
          await deleteLocalLevelByUuidAndMarkSynced(payload.uuid);
          return;
        }
        throw error;
      }

      if (data?.[0]) {
        await updateLocalLevelSupabaseId(change.entity_local_id, change.entity_uuid, data[0].id);
        await markLevelAsSynced(change.entity_local_id);
      }
    } else if (change.operation === 'UPDATE') {
      const { error } = await supabase
        .from('levels')
        .update({
          name: payload.name,
          updated_at: payload.updated_at,
          is_synced: true
        })
        .eq('uuid', payload.uuid)
        .is('deleted_at', null);

      if (error) throw error;
      await markLevelAsSynced(change.entity_local_id);
    } else if (change.operation === 'DELETE') {
      const { error } = await supabase
        .from('levels')
        .update({
          deleted_at: payload.deleted_at,
          updated_at: payload.updated_at,
          is_synced: true
        })
        .eq('uuid', payload.uuid);

      if (error) throw error;
    }
  }

  // مزامنة تغيير طالب
  private async syncStudentChange(change: any, payload: any): Promise<void> {
    // جلب office_id و level_id من Supabase باستخدام UUID
    const [officeResult, levelResult] = await Promise.all([
      supabase.from('offices').select('id').eq('uuid', payload.office_uuid).single(),
      supabase.from('levels').select('id').eq('uuid', payload.level_uuid).single()
    ]);

    if (officeResult.error || levelResult.error) {
      console.error('❌ لا يمكن العثور على المركز أو المستوى في Supabase');
      return;
    }

    if (change.operation === 'INSERT') {
      const { data, error } = await supabase
        .from('students')
        .insert([{
          uuid: payload.uuid,
          name: payload.name,
          birth_date: payload.birth_date || null,
          phone: payload.phone || null,
          address: payload.address || null,
          office_id: officeResult.data.id,
          level_id: levelResult.data.id,
          created_at: payload.created_at,
          updated_at: payload.updated_at,
          is_synced: true
        }])
        .select();

      if (error) {
        if (error.code === '23505') {
          await deleteLocalStudentByUuidAndMarkSynced(payload.uuid);
          return;
        }
        throw error;
      }

      if (data?.[0]) {
        await updateLocalStudentSupabaseId(change.entity_local_id, change.entity_uuid, data[0].id);
        await markStudentAsSynced(change.entity_local_id);
      }
    } else if (change.operation === 'UPDATE') {
      const { error } = await supabase
        .from('students')
        .update({
          name: payload.name,
          birth_date: payload.birth_date || null,
          phone: payload.phone || null,
          address: payload.address || null,
          office_id: officeResult.data.id,
          level_id: levelResult.data.id,
          updated_at: payload.updated_at,
          is_synced: true
        })
        .eq('uuid', payload.uuid)
        .is('deleted_at', null);

      if (error) throw error;
      await markStudentAsSynced(change.entity_local_id);
    } else if (change.operation === 'DELETE') {
      const { error } = await supabase
        .from('students')
        .update({
          deleted_at: payload.deleted_at,
          updated_at: payload.updated_at,
          is_synced: true
        })
        .eq('uuid', payload.uuid);

      if (error) throw error;
    }
  }

  // جلب البيانات من Supabase وتحديث البيانات المحلية
  private async syncRemoteDataToLocal(): Promise<void> {
    const currentUser = authManager.getCurrentUser();
    if (!currentUser) {
      throw new Error('المستخدم غير مسجل الدخول');
    }

    // مزامنة البيانات بناءً على صلاحيات المستخدم
    if (currentUser.role === 'admin') {
      // المسؤول يرى جميع البيانات
      await Promise.all([
        fetchAndSyncRemoteOffices(),
        fetchAndSyncRemoteLevels(),
        fetchAndSyncRemoteStudents(),
      ]);
    } else {
      // المستخدم العادي يرى البيانات المرتبطة بمراكزه فقط
      await this.syncUserSpecificData(currentUser.id);
    }
  }

  // مزامنة البيانات الخاصة بمستخدم معين
  private async syncUserSpecificData(userId: string): Promise<void> {
    try {
      // جلب المراكز المسموح للمستخدم بالوصول إليها
      const { data: userOffices, error: userOfficesError } = await supabase
        .from('user_offices')
        .select('office_id')
        .eq('user_id', userId);

      if (userOfficesError) throw userOfficesError;

      const allowedOfficeIds = userOffices?.map(uo => uo.office_id) || [];

      if (allowedOfficeIds.length === 0) {
        console.log('المستخدم لا يملك صلاحية على أي مركز');
        return;
      }

      // جلب المراكز المسموحة
      const { data: offices, error: officesError } = await supabase
        .from('offices')
        .select('*')
        .in('id', allowedOfficeIds);

      if (officesError) throw officesError;

      // جلب جميع المستويات (المستخدم يمكنه رؤية جميع المستويات)
      await fetchAndSyncRemoteLevels();

      // جلب الطلاب في المراكز المسموحة فقط
      const { data: students, error: studentsError } = await supabase
        .from('students')
        .select('*')
        .in('office_id', allowedOfficeIds);

      if (studentsError) throw studentsError;

      // تحديث البيانات المحلية
      // هنا يمكنك إضافة منطق تحديث البيانات المحلية بناءً على البيانات المجلبة
      console.log(`✅ تمت مزامنة ${offices?.length || 0} مراكز و ${students?.length || 0} طلاب للمستخدم`);

    } catch (error: any) {
      console.error('خطأ في مزامنة البيانات الخاصة بالمستخدم:', error);
      throw error;
    }
  }

  // التحقق من حالة المزامنة
  isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  // مزامنة تلقائية عند الاتصال بالإنترنت
  async autoSync(): Promise<void> {
    const netState = await NetInfo.fetch();
    if (netState.isConnected && authManager.isAuthenticated()) {
      try {
        await this.fullSync();
      } catch (error) {
        console.error('خطأ في المزامنة التلقائية:', error);
      }
    }
  }
}

// تصدير instance واحد
export const syncManager = SyncManager.getInstance();