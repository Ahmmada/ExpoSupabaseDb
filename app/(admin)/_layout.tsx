// app/(admin)/_layout.tsx
import React, { useState } from 'react';
import { Drawer } from 'expo-router/drawer';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { MaterialCommunityIcons, FontAwesome6 } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, View, ActivityIndicator, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authManager } from '@/lib/authManager';

export default function AdminDrawerLayout() {
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
    <Drawer screenOptions={{
      headerShown: true,
      drawerActiveTintColor: Colors[colorScheme ?? 'light'].tint,
      headerStyle: {
        backgroundColor: Colors[colorScheme ?? 'light'].background,
      },
      headerTintColor: Colors[colorScheme ?? 'light'].text,
      headerRight: () => <LogoutButton />, // إضافة زر تسجيل الخروج هنا
    }}>
      <Drawer.Screen
        name="index"
        options={{
          drawerLabel: 'الرئيسية',
          title: 'لوحة تحكم المسؤول',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-dashboard-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="students"
        options={{
          drawerLabel: 'الطلاب',
          title: 'إدارة الطلاب',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-details" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="users"
        options={{
          drawerLabel: 'المستخدمون',
          title: 'إدارة المستخدمين',
          drawerIcon: ({ color, size }) => (
            <FontAwesome6 name="users" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="levels"
        options={{
          drawerLabel: 'المستويات',
          title: 'إدارة المستويات',
          drawerIcon: ({ color, size }) => (
            <FontAwesome6 name="ranking-star" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="offices"
        options={{
          drawerLabel: 'المراكز',
          title: 'إدارة المراكز',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="school-outline" size={size} color={color} />
          ),
        }}
      />

    </Drawer>
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
