// app/(admin)/attendances/index.tsx
import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import {
  getAllAttendanceRecords,
  deleteAttendanceRecord,
  AttendanceRecord,
  syncUpAttendanceRecords,
  syncDownAttendanceRecords,
} from '@/lib/attendanceDb';
import { SafeAreaView } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { getUnsyncedChanges } from '@/lib/syncQueueDb';
import SearchBar from '@/components/SearchBar'; // استيراد مكون SearchBar

export default function AttendanceIndexScreen() {
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [filteredAttendanceRecords, setFilteredAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchAttendanceRecords = useCallback(async () => {
    setLoading(true);
    try {
      const records = await getAllAttendanceRecords();
      setAttendanceRecords(records);
      
      const changes = await getUnsyncedChanges('attendance_records');
      setUnsyncedCount(changes.length);
    } catch (error) {
      console.error("Failed to fetch attendance records:", error);
      Alert.alert('خطأ', 'فشل في جلب سجلات الحضور.');
    } finally {
      setLoading(false);
    }
  }, []);

  // استخدام useFocusEffect لجلب البيانات في كل مرة يتم فيها التركيز على الشاشة
  useFocusEffect(
    useCallback(() => {
      fetchAttendanceRecords();
    }, [fetchAttendanceRecords])
  );

  // تأثير useEffect لتصفية السجلات بناءً على البحث
  useEffect(() => {
    if (searchQuery === '') {
      setFilteredAttendanceRecords(attendanceRecords);
    } else {
      const lowerCaseQuery = searchQuery.toLowerCase();
      const filtered = attendanceRecords.filter(record => 
        record.date.toLowerCase().includes(lowerCaseQuery) ||
        record.office_name?.toLowerCase().includes(lowerCaseQuery) ||
        record.level_name?.toLowerCase().includes(lowerCaseQuery)
      );
      setFilteredAttendanceRecords(filtered);
    }
  }, [searchQuery, attendanceRecords]);

  const handleSync = async () => {
    setSyncing(true);
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      Alert.alert('لا يوجد اتصال بالإنترنت', 'لا يمكن المزامنة بدون اتصال بالإنترنت.');
      setSyncing(false);
      return;
    }
    
    try {
      await syncUpAttendanceRecords();
      await syncDownAttendanceRecords();
      await fetchAttendanceRecords(); // تحديث القائمة بعد المزامنة
      Alert.alert('نجاح', 'تمت المزامنة بنجاح.');
    } catch (error) {
      console.error("Sync failed:", error);
      Alert.alert('خطأ', 'فشلت المزامنة.');
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = useCallback((uuid: string) => {
    Alert.alert(
      'حذف سجل الحضور',
      'هل أنت متأكد أنك تريد حذف هذا السجل نهائيًا؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAttendanceRecord(uuid);
              await fetchAttendanceRecords();
              Alert.alert('نجاح', 'تم حذف السجل بنجاح.');
            } catch (error) {
              console.error("Delete failed:", error);
              Alert.alert('خطأ', 'فشل في حذف السجل.');
            }
          },
        },
      ]
    );
  }, [fetchAttendanceRecords]);

  const renderItem = ({ item }: { item: AttendanceRecord }) => (
    <View style={styles.card}>
      <View style={styles.recordInfo}>
        <Text style={styles.recordDate}>{item.date}</Text>
        <Text style={styles.recordDetails}>المركز: {item.office_name}</Text>
        <Text style={styles.recordDetails}>المستوى: {item.level_name}</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actionButton, styles.editButton]} onPress={() => router.push({ pathname: `/attendances/form`, params: { recordUuid: item.uuid } })}>
          <Ionicons name="create-outline" size={24} color="#6366f1" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => handleDelete(item.uuid)}>
          <Ionicons name="trash-outline" size={24} color="#ef4444" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>سجلات الحضور</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.syncButton} onPress={handleSync} disabled={syncing}>
            <Ionicons name="sync-outline" size={24} color="#fff" />
            {unsyncedCount > 0 && (
              <View style={styles.syncBadge}>
                <Text style={styles.syncBadgeText}>{unsyncedCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.addButton} onPress={() => router.push('/attendances/form')}>
            <Ionicons name="add-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
      
      <SearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />

      {loading ? (
        <View style={styles.loadingContainer}>
          <Text>جاري تحميل البيانات...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredAttendanceRecords}
          keyExtractor={item => item.uuid}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={fetchAttendanceRecords} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addButton: {
    backgroundColor: '#6366f1',
    padding: 8,
    borderRadius: 8,
  },
  syncButton: {
    backgroundColor: '#374151',
    padding: 8,
    borderRadius: 8,
    position: 'relative',
  },
  syncBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  listContent: {
    padding: 10,
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  recordInfo: {
    flex: 1,
  },
  recordDate: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 5,
  },
  recordDetails: {
    fontSize: 14,
    color: '#6b7280',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
    borderRadius: 8,
  },
  editButton: {
    backgroundColor: '#e0e7ff',
  },
  deleteButton: {
    backgroundColor: '#fee2e2',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
