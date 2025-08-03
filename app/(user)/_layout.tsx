// app/(user)/_layout.tsx
import { Tabs , router} from 'expo-router';
import React, { useState, useEffect } from 'react';
import { Alert, View, ActivityIndicator, Text, StyleSheet, TouchableOpacity , Platform } from 'react-native';
import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { MaterialCommunityIcons, FontAwesome6, Ionicons } from '@expo/vector-icons';
import { authManager } from '@/lib/authManager';

export default function UserTabLayout() {
  const colorScheme = useColorScheme();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    Alert.alert(
      'تسجيل الخروج',
      'هل أنت متأكد أنك تريد تسجيل الخروج؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تسجيل الخروج',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {


              const result = await authManager.signOut();
              
              if (result.success) {
                Alert.alert('تم تسجيل الخروج', 'تم تسجيل خروجك بنجاح.');
                router.replace('/signIn');
              } else {
                Alert.alert('خطأ في تسجيل الخروج', result.error || 'حدث خطأ غير متوقع');
              }
            } catch (error: any) {
              Alert.alert('خطأ في تسجيل الخروج', error.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };
  
  // مكون الزر الذي سيتم عرضه في الرأس
  const LogoutButton = () => (
    <TouchableOpacity
      style={styles.logoutButton}
      onPress={handleSignOut}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color={Colors[colorScheme ?? 'light'].text} />
      ) : (
        <Ionicons
          name="log-out-outline"
          size={24}
          color={Colors[colorScheme ?? 'light'].text}
        />
      )}
    </TouchableOpacity>
  );


  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            position: 'absolute',
          },
          default: {},
        }),
      headerRight: () => <LogoutButton />,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'الرئيسية',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="students"
        options={{
          headerShown: true,
          title: 'الطلاب',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="account-details" size={20} color={color} />
          ),
        }}
      />
      {/* لا توجد شاشات إضافية هنا للمستخدم العادي */}
    </Tabs>
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
  logoutButton: {
    paddingRight: 16,
  },
});
