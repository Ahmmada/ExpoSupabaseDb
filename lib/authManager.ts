// lib/authManager.ts
import { supabase } from './supabase';
import { saveLocalProfile, getLocalProfile, deleteLocalProfile, verifyOfflinePassword } from './localProfile';
import NetInfo from '@react-native-community/netinfo';
import { Alert } from 'react-native';

export interface AuthUser {
  id: string;
  email: string;
  role: 'admin' | 'user';
  full_name?: string;
  avatar_url?: string;
}

export class AuthManager {
  private static instance: AuthManager;
  private currentUser: AuthUser | null = null;
  private authListeners: ((user: AuthUser | null) => void)[] = [];

  private constructor() {}

  static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  // إضافة مستمع لتغييرات المصادقة
  addAuthListener(listener: (user: AuthUser | null) => void) {
    this.authListeners.push(listener);
    // إرسال الحالة الحالية فوراً
    listener(this.currentUser);
  }

  // إزالة مستمع
  removeAuthListener(listener: (user: AuthUser | null) => void) {
    this.authListeners = this.authListeners.filter(l => l !== listener);
  }

  // إشعار جميع المستمعين
  private notifyListeners() {
    this.authListeners.forEach(listener => listener(this.currentUser));
  }

  // تسجيل الدخول
  async signIn(email: string, password: string): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
    try {
      const netState = await NetInfo.fetch();
      const isConnected = netState.isConnected;

      if (!isConnected) {
        // وضع عدم الاتصال - التحقق من البيانات المحلية
        const localUser = await verifyOfflinePassword(email, password);
        if (localUser) {
          this.currentUser = {
            id: localUser.supabase_id,
            email: localUser.email || email,
            role: (localUser.role as 'admin' | 'user') || 'user',
            full_name: localUser.full_name,
            avatar_url: localUser.avatar_url,
          };
          this.notifyListeners();
          return { success: true, user: this.currentUser };
        } else {
          return { success: false, error: 'بيانات الدخول غير صحيحة أو غير متوفرة محلياً' };
        }
      }

      // وضع الاتصال - التحقق من Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data.user) {
        return { success: false, error: 'فشل في تسجيل الدخول' };
      }

      // جلب ملف التعريف
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', data.user.id)
        .single();

      if (profileError) {
        console.error('خطأ في جلب ملف التعريف:', profileError);
        return { success: false, error: 'فشل في جلب بيانات المستخدم' };
      }

      this.currentUser = {
        id: data.user.id,
        email: data.user.email || email,
        role: profile.role || 'user',
        full_name: profile.full_name || data.user.user_metadata?.full_name,
        avatar_url: data.user.user_metadata?.avatar_url,
      };

      // حفظ البيانات محلياً للاستخدام في وضع عدم الاتصال
      await saveLocalProfile({
        supabase_id: this.currentUser.id,
        email: this.currentUser.email,
        role: this.currentUser.role,
        full_name: this.currentUser.full_name,
        avatar_url: this.currentUser.avatar_url,
        password_hash: password,
      });

      this.notifyListeners();
      return { success: true, user: this.currentUser };

    } catch (error: any) {
      console.error('خطأ في تسجيل الدخول:', error);
      return { success: false, error: error.message };
    }
  }

  // تسجيل الخروج
  async signOut(): Promise<{ success: boolean; error?: string }> {
    try {
      const netState = await NetInfo.fetch();
      const isConnected = netState.isConnected;

      if (isConnected) {
        // محاولة تسجيل الخروج من Supabase إذا كان متصلاً
        const { error } = await supabase.auth.signOut();
        if (error) {
          console.error('خطأ في تسجيل الخروج من Supabase:', error);
          // لا نتوقف هنا، نكمل تسجيل الخروج محلياً
        }
      }

      // تسجيل الخروج محلياً
      await deleteLocalProfile();
      this.currentUser = null;
      this.notifyListeners();

      return { success: true };
    } catch (error: any) {
      console.error('خطأ في تسجيل الخروج:', error);
      return { success: false, error: error.message };
    }
  }

  // التحقق من حالة المصادقة الحالية
  async checkAuthState(): Promise<AuthUser | null> {
    try {
      const netState = await NetInfo.fetch();
      const isConnected = netState.isConnected;

      if (isConnected) {
        // التحقق من جلسة Supabase
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('خطأ في جلب الجلسة:', error);
          // في حالة الخطأ، نتحقق من البيانات المحلية
          return await this.checkLocalAuth();
        }

        if (session?.user) {
          // جلب ملف التعريف
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role, full_name')
            .eq('id', session.user.id)
            .single();

          if (!profileError && profile) {
            this.currentUser = {
              id: session.user.id,
              email: session.user.email || '',
              role: profile.role || 'user',
              full_name: profile.full_name || session.user.user_metadata?.full_name,
              avatar_url: session.user.user_metadata?.avatar_url,
            };

            // تحديث البيانات المحلية (بدون كلمة المرور)
            const localProfile = await getLocalProfile();
            if (localProfile) {
              await saveLocalProfile({
                supabase_id: this.currentUser.id,
                email: this.currentUser.email,
                role: this.currentUser.role,
                full_name: this.currentUser.full_name,
                avatar_url: this.currentUser.avatar_url,
                password_hash: localProfile.password_hash, // الاحتفاظ بكلمة المرور المحفوظة
              });
            }

            this.notifyListeners();
            return this.currentUser;
          }
        }
      }

      // التحقق من البيانات المحلية
      return await this.checkLocalAuth();
    } catch (error: any) {
      console.error('خطأ في التحقق من حالة المصادقة:', error);
      return await this.checkLocalAuth();
    }
  }

  // التحقق من المصادقة المحلية
  private async checkLocalAuth(): Promise<AuthUser | null> {
    try {
      const localProfile = await getLocalProfile();
      if (localProfile) {
        this.currentUser = {
          id: localProfile.supabase_id,
          email: localProfile.email || '',
          role: (localProfile.role as 'admin' | 'user') || 'user',
          full_name: localProfile.full_name,
          avatar_url: localProfile.avatar_url,
        };
        this.notifyListeners();
        return this.currentUser;
      }
      return null;
    } catch (error: any) {
      console.error('خطأ في التحقق من المصادقة المحلية:', error);
      return null;
    }
  }

  // الحصول على المستخدم الحالي
  getCurrentUser(): AuthUser | null {
    return this.currentUser;
  }

  // التحقق من صلاحيات المستخدم
  hasRole(role: 'admin' | 'user'): boolean {
    return this.currentUser?.role === role;
  }

  // التحقق من تسجيل الدخول
  isAuthenticated(): boolean {
    return this.currentUser !== null;
  }
}

// تصدير instance واحد
export const authManager = AuthManager.getInstance();