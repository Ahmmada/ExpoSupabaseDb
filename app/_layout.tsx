// app/_layout.tsx
import React, { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, router, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { initDb } from '@/lib/database';
import 'react-native-reanimated';
import { Alert, View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { authManager } from '@/lib/authManager';
import { syncManager } from '@/lib/syncManager';
import 'react-native-get-random-values'
import { useFrameworkReady } from '@/hooks/useFrameworkReady';

// منع إخفاء شاشة البداية تلقائياً حتى يكون التطبيق جاهزاً
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useFrameworkReady();
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  const [isAppReady, setIsAppReady] = useState(false);
  const [targetRoute, setTargetRoute] = useState<string>('/signIn');

  // تهيئة التطبيق وتحديد المسار المستهدف
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // تهيئة قاعدة البيانات المحلية
        await initDb();
        console.log('✅ تم تهيئة قاعدة البيانات المحلية بنجاح.');

        // التحقق من حالة المصادقة
        const user = await authManager.checkAuthState();
        
        if (user) {
          console.log('✅ تم العثور على مستخدم مسجل الدخول:', user.email);
          setTargetRoute(user.role === 'admin' ? '/(admin)' : '/(user)');
          
          // بدء المزامنة التلقائية في الخلفية
          syncManager.autoSync();
        } else {
          console.log('❌ لم يتم العثور على مستخدم مسجل الدخول');
          setTargetRoute('/signIn');
        }

      } catch (error) {
        console.error('❌ فشل في تهيئة التطبيق:', error);
        setTargetRoute('/signIn');
      } finally {
        setIsAppReady(true);
        SplashScreen.hideAsync();
      }
    };

    initializeApp();
  }, []);

  // التوجيه عند جاهزية التطبيق
  useEffect(() => {
    if (fontsLoaded && isAppReady) {
      console.log(`✨ التوجيه إلى: ${targetRoute}`);
      router.replace(targetRoute);
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isAppReady, targetRoute]);

  if (!fontsLoaded || !isAppReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors[colorScheme ?? 'light'].tint} />
        <Text style={styles.loadingText}>جاري إعداد التطبيق...</Text>
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="signIn" options={{ headerShown: false }} />
        <Stack.Screen name="signUp" options={{ headerShown: false }} />
        <Stack.Screen name="(admin)" options={{ headerShown: false }} />
        <Stack.Screen name="(user)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#6366f1',
  },
});
