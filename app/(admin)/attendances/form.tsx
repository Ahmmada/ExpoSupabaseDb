// app/(admin)/attendances/form.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Alert,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import DatePickerInput from '@/components/DatePickerInput';
import { useLocalSearchParams, router } from 'expo-router';
import { Student } from '@/lib/studentsDb';
import { getLocalOffices, Office } from '@/lib/officesDb';
import { getLocalLevels, Level } from '@/lib/levelsDb';
import {
  getStudentsByOfficeAndLevel,
  getAttendanceRecordByUuid,
  getStudentAttendanceForRecord,
  saveAttendance,
} from '@/lib/attendanceDb';

// Possible student attendance status
type AttendanceStatus = 'present' | 'absent' | 'excused';

// Data to be used in the UI
type StudentWithAttendance = Student & {
  attendanceStatus: AttendanceStatus;
};

const AttendanceFormScreen = () => {
  const { recordUuid } = useLocalSearchParams();
  
  const [offices, setOffices] = useState<Office[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [selectedOffice, setSelectedOffice] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [students, setStudents] = useState<StudentWithAttendance[]>([]);
  const [loading, setLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    const loadInitialData = async () => {
      const loadedOffices = await getLocalOffices();
      const loadedLevels = await getLocalLevels();
      setOffices(loadedOffices);
      setLevels(loadedLevels);
      
      if (recordUuid) {
        setIsEditMode(true);
        const record = await getAttendanceRecordByUuid(recordUuid as string);
        if (record) {
          setSelectedDate(record.date);
          setSelectedOffice(record.office_uuid);
          setSelectedLevel(record.level_uuid);
        }
      } else {
        const today = new Date().toISOString().split('T')[0];
        setSelectedDate(today);
        if (loadedOffices.length > 0) setSelectedOffice(loadedOffices[0].uuid);
        if (loadedLevels.length > 0) setSelectedLevel(loadedLevels[0].uuid);
      }
    };
    loadInitialData();
  }, [recordUuid]);

  useEffect(() => {
    const fetchStudentsAndAttendance = async () => {
      if (selectedOffice && selectedLevel) {
        setLoading(true);
        const fetchedStudents = await getStudentsByOfficeAndLevel(selectedOffice, selectedLevel);
        let studentAttendanceStatus: Record<string, AttendanceStatus> = {};
        
        if (isEditMode) {
          const statuses = await getStudentAttendanceForRecord(recordUuid as string);
          statuses.forEach(s => {
            studentAttendanceStatus[s.student_uuid] = s.status;
          });
        }
        
        const studentsWithAttendance = fetchedStudents.map(student => ({
          ...student,
          attendanceStatus: studentAttendanceStatus[student.uuid] || 'absent',
        }));
        setStudents(studentsWithAttendance);
        setLoading(false);
      } else {
        setStudents([]);
      }
    };

    fetchStudentsAndAttendance();
  }, [selectedOffice, selectedLevel, selectedDate, isEditMode, recordUuid]);

  const handleStatusChange = useCallback((studentUuid: string, status: AttendanceStatus) => {
    setStudents(prevStudents =>
      prevStudents.map(student =>
        student.uuid === studentUuid ? { ...student, attendanceStatus: status } : student
      )
    );
  }, []);

  const handleSaveAttendance = async () => {
    if (!selectedOffice || !selectedLevel || !selectedDate) {
      Alert.alert('خطأ', 'الرجاء اختيار المركز والمستوى والتاريخ.');
      return;
    }

    setLoading(true);
    const studentsStatus = students.map(s => ({
      studentUuid: s.uuid,
      status: s.attendanceStatus,
    }));

    try {
      await saveAttendance(selectedDate, selectedOffice, selectedLevel, studentsStatus, isEditMode ? recordUuid as string : undefined);
      Alert.alert('نجاح', 'تم حفظ سجل الحضور بنجاح.');
      router.back();
    } catch (error: any) {
      console.error('❌ خطأ في حفظ الحضور:', error.message);
      // عرض رسالة خطأ واضحة للمستخدم في حالة وجود سجل مكرر
      if (error.message.includes('Attendance record already exists')) {
        Alert.alert('خطأ', 'يوجد سجل حضور مسبق لنفس المركز والمستوى والتاريخ.');
      } else {
        Alert.alert('خطأ', 'فشل في حفظ سجل الحضور.');
      }
    } finally {
      setLoading(false);
    }
  };

  const renderStudentItem = ({ item }: { item: StudentWithAttendance }) => (
    <View style={styles.studentItem}>
      <Text style={styles.studentName}>{item.name}</Text>
      <View style={styles.statusOptions}>
        <TouchableOpacity
          style={[styles.statusButton, item.attendanceStatus === 'present' && styles.statusPresent]}
          onPress={() => handleStatusChange(item.uuid, 'present')}
        >
          <Text style={styles.statusText}>حاضر</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.statusButton, item.attendanceStatus === 'excused' && styles.statusExcused]}
          onPress={() => handleStatusChange(item.uuid, 'excused')}
        >
          <Text style={styles.statusText}>مستأذن</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.statusButton, item.attendanceStatus === 'absent' && styles.statusAbsent]}
          onPress={() => handleStatusChange(item.uuid, 'absent')}
        >
          <Text style={styles.statusText}>غائب</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.formContainer}>
      <Text style={styles.label}>التاريخ:</Text>
      <DatePickerInput value={selectedDate} onDateChange={setSelectedDate} />

      <Text style={styles.label}>المركز:</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={selectedOffice}
          onValueChange={(itemValue) => setSelectedOffice(itemValue)}
          style={styles.picker}
          enabled={!isEditMode}
        >
          {offices.map(office => (
            <Picker.Item key={office.uuid} label={office.name} value={office.uuid} />
          ))}
        </Picker>
      </View>

      <Text style={styles.label}>المستوى:</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={selectedLevel}
          onValueChange={(itemValue) => setSelectedLevel(itemValue)}
          style={styles.picker}
          enabled={!isEditMode}
        >
          {levels.map(level => (
            <Picker.Item key={level.uuid} label={level.name} value={level.uuid} />
          ))}
        </Picker>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 5 }}>
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.title}>
          {isEditMode ? 'تعديل سجل الحضور' : 'إنشاء سجل حضور جديد'}
        </Text>
        <TouchableOpacity style={styles.saveButton} onPress={handleSaveAttendance} disabled={loading}>
          <Ionicons name="save-outline" size={24} color="white" />
        </TouchableOpacity>
      </View>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>جلب بيانات الطلاب...</Text>
        </View>
      ) : (
        <FlatList
          data={students}
          keyExtractor={item => item.uuid}
          renderItem={renderStudentItem}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>لا يوجد طلاب بهذا المركز والمستوى.</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
};

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
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e293b',
    flex: 1,
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: '#6366f1',
    padding: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  formContainer: {
    padding: 20,
    backgroundColor: '#fff',
    marginBottom: 10,
    borderRadius: 8,
    marginHorizontal: 10,
    marginTop: 10,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    textAlign: 'right',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
    width: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 50,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#6b7280',
  },
  listContent: {
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  studentItem: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
    textAlign: 'right',
  },
  statusOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  statusButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#6b7280',
  },
  statusPresent: {
    backgroundColor: '#dcfce7',
    borderColor: '#22c55e',
  },
  statusExcused: {
    backgroundColor: '#fffbeb',
    borderColor: '#f59e0b',
  },
  statusAbsent: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
  },
});

export default AttendanceFormScreen;
