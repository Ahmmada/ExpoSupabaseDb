// app/signIn.tsx
import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { authManager } from '@/lib/authManager';
import { syncManager } from '@/lib/syncManager';

const LAST_EMAIL_KEY = 'last_signIn_email';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const fetchLastEmail = async () => {
      try {
        const storedEmail = await SecureStore.getItemAsync(LAST_EMAIL_KEY);
        if (storedEmail) {
          setEmail(storedEmail);
        }
      } catch (error) {
        console.error('Failed to retrieve last email from SecureStore:', error);
      }
    };

    fetchLastEmail();
  }, []);

  const handleSignIn = async () => {
    setLoading(true);

    try {
      const result = await authManager.signIn(email, password);
      
      if (result.success && result.user) {
        // حفظ آخر بريد إلكتروني عند نجاح تسجيل الدخول
        await SecureStore.setItemAsync(LAST_EMAIL_KEY, email);

        // إعادة توجيه المستخدم بناءً على الدور
        router.replace(result.user.role === 'admin' ? '/(admin)' : '/(user)');
        
        // بدء المزامنة التلقائية في الخلفية
        syncManager.autoSync();
      } else {
        Alert.alert('خطأ في تسجيل الدخول', result.error || 'حدث خطأ غير متوقع');
      }
    } catch (error: any) {
      Alert.alert('خطأ', error.message || 'حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.content}>
        <Text style={styles.title}>تسجيل الدخول</Text>
        <TextInput
          style={styles.input}
          placeholder="البريد الإلكتروني"
          placeholderTextColor="#9ca3af"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!loading}
        />
        <View style={styles.passwordInputContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="كلمة المرور"
            placeholderTextColor="#9ca3af"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            editable={!loading}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={24}
              color="#9ca3af"
            />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>تسجيل الدخول</Text>
          )}
        </TouchableOpacity>
        <View style={styles.signUpContainer}>
          <Text style={styles.signUpText}>ليس لديك حساب؟</Text>
          <TouchableOpacity onPress={() => router.push('/signUp')}>
            <Text style={styles.signUpLink}>إنشاء حساب</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    fontSize: 16,
    color: '#1e293b',
    textAlign: 'right',
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
    textAlign: 'right',
  },
  button: {
    width: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    backgroundColor: '#a5b4fc',
  },
  signUpContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  signUpText: {
    fontSize: 14,
    color: '#64748b',
    marginRight: 5,
  },
  signUpLink: {
    fontSize: 14,
    color: '#6366f1',
    fontWeight: 'bold',
  },
});
