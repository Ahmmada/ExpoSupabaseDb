// app/(admin)/students.tsx
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Alert,
  Modal,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Platform,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import SearchBar from '@/components/SearchBar';
import SyncStatus from '@/components/SyncStatus';
import StudentItem from '@/components/StudentItem';
import DatePickerInput from '@/components/DatePickerInput';
import { exportStudentsToPdf } from '@/lib/pdfExporter';
import {
  getLocalStudents,
  insertLocalStudent,
  updateLocalStudent,
  deleteLocalStudent,
  Student,
} from '@/lib/studentsDb';
import { getLocalOffices, Office } from '@/lib/officesDb';
import { getLocalLevels, Level } from '@/lib/levelsDb';
import { syncManager } from '@/lib/syncManager';
import { authManager } from '@/lib/authManager';
import NetInfo from '@react-native-community/netinfo';

export default function StudentsScreen() {
  // حالات البيانات الأساسية
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // حالات النموذج
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [selectedOfficeUuid, setSelectedOfficeUuid] = useState<string | null>(null);
  const [selectedLevelUuid, setSelectedLevelUuid] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // حالات أخرى
  const [searchQuery, setSearchQuery] = useState('');
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'completed' | 'error'>('idle');

  // تهيئة الشاشة
  useEffect(() => {
    let unsubscribeNet: (() => void) | undefined;
    let unsubscribeSync: (() => void) | undefined;

    const initialize = async () => {
      try {
        // مراقبة حالة الاتصال
        unsubscribeNet = NetInfo.addEventListener(state => {
          setIsConnected(state.isConnected);
        });

        // مراقبة حالة المزامنة
        const handleSyncStatus = (status: 'syncing' | 'completed' | 'error') => {
          setSyncStatus(status);
          if (status === 'completed' || status === 'error') {
            setTimeout(() => setSyncStatus('idle'), 2000);
          }
        };
        syncManager.addSyncListener(handleSyncStatus);

        // تحميل البيانات الأولية
        await Promise.all([
          loadStudents(),
          loadOfficesAndLevels(),
        ]);

        // بدء المزامنة التلقائية
        syncManager.autoSync();

      } catch (error) {
        console.error('❌ خطأ في تهيئة شاشة الطلاب:', error);
        Alert.alert('خطأ', 'فشل في تهيئة الشاشة');
      }
    };

    initialize();

    return () => {
      unsubscribeNet?.();
      if (unsubscribeSync) {
        syncManager.removeSyncListener(unsubscribeSync);
      }
    };
  }, []);

  // تحميل بيانات الطلاب
  const loadStudents = useCallback(async () => {
    try {
      const data = await getLocalStudents();
      setStudents(data);
      setFilteredStudents(data);
    } catch (error: any) {
      console.error('❌ خطأ في تحميل الطلاب:', error);
      Alert.alert('خطأ', 'فشل في تحميل بيانات الطلاب');
    }
  }, []);

  // تحميل المراكز والمستويات
  const loadOfficesAndLevels = useCallback(async () => {
    try {
      const [officesData, levelsData] = await Promise.all([
        getLocalOffices(),
        getLocalLevels(),
      ]);
      setOffices(officesData);
      setLevels(levelsData);
    } catch (error: any) {
      console.error('❌ خطأ في تحميل المراكز والمستويات:', error);
      Alert.alert('خطأ', 'فشل في تحميل بيانات المراكز أو المستويات');
    }
  }, []);

  // تحديث البيانات (Pull to Refresh)
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadStudents(),
        loadOfficesAndLevels(),
      ]);
      
      // تشغيل المزامنة إذا كان متصلاً
      if (isConnected) {
        await syncManager.fullSync();
      }
    } catch (error: any) {
      console.error('❌ خطأ في تحديث البيانات:', error);
    } finally {
      setRefreshing(false);
    }
  }, [loadStudents, loadOfficesAndLevels, isConnected]);

  // فلترة الطلاب حسب البحث
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredStudents(students);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredStudents(
        students.filter(student =>
          student.name.toLowerCase().includes(query) ||
          (student.office_name && student.office_name.toLowerCase().includes(query)) ||
          (student.level_name && student.level_name.toLowerCase().includes(query)) ||
          (student.phone && student.phone.includes(query))
        )
      );
    }
  }, [searchQuery, students]);

  // إعادة تعيين النموذج
  const resetForm = useCallback(() => {
    setName('');
    setBirthDate('');
    setPhone('');
    setAddress('');
    setSelectedOfficeUuid(null);
    setSelectedLevelUuid(null);
    setEditingId(null);
  }, []);

  // فتح نموذج إضافة طالب جديد
  const handleAddStudent = useCallback(() => {
    resetForm();
    setModalVisible(true);
  }, [resetForm]);

  // فتح نموذج تعديل طالب
  const handleEditStudent = useCallback((student: Student) => {
    setEditingId(student.id);
    setName(student.name);
    setBirthDate(student.birth_date || '');
    setPhone(student.phone || '');
    setAddress(student.address || '');
    setSelectedOfficeUuid(student.office_uuid);
    setSelectedLevelUuid(student.level_uuid);
    setModalVisible(true);
  }, []);

  // حفظ الطالب (إضافة أو تعديل)
  const handleSaveStudent = useCallback(async () => {
    // التحقق من صحة البيانات
    if (!name.trim()) {
      Alert.alert('خطأ', 'يرجى إدخال اسم الطالب');
      return;
    }
    if (!selectedOfficeUuid) {
      Alert.alert('خطأ', 'يرجى اختيار المركز');
      return;
    }
    if (!selectedLevelUuid) {
      Alert.alert('خطأ', 'يرجى اختيار المستوى');
      return;
    }

    setSaving(true);
    try {
      const studentData = {
        name: name.trim(),
        birth_date: birthDate || undefined,
        phone: phone || undefined,
        address: address || undefined,
        office_uuid: selectedOfficeUuid,
        level_uuid: selectedLevelUuid,
      };

      if (editingId) {
        await updateLocalStudent(editingId, studentData);
        Alert.alert('نجح', 'تم تحديث بيانات الطالب بنجاح');
      } else {
        const { localId, uuid } = await insertLocalStudent(studentData);
        console.log(`✅ تم إنشاء طالب جديد: ID=${localId}, UUID=${uuid}`);
        Alert.alert('نجح', 'تم إضافة الطالب بنجاح');
      }

      // إغلاق النموذج وتحديث البيانات
      setModalVisible(false);
      resetForm();
      await loadStudents();

      // تشغيل المزامنة إذا كان متصلاً
      if (isConnected) {
        syncManager.autoSync();
      }

    } catch (error: any) {
      console.error('❌ خطأ في حفظ الطالب:', error);
      Alert.alert('خطأ', error.message || 'فشل في حفظ بيانات الطالب');
    } finally {
      setSaving(false);
    }
  }, [name, birthDate, phone, address, selectedOfficeUuid, selectedLevelUuid, editingId, isConnected, resetForm, loadStudents]);

  // حذف طالب
  const handleDeleteStudent = useCallback(async (id: number, studentName: string) => {
    Alert.alert(
      'تأكيد الحذف',
      `هل تريد حذف الطالب "${studentName}"؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLocalStudent(id);
              await loadStudents();
              Alert.alert('تم الحذف', 'تم حذف الطالب بنجاح');

              // تشغيل المزامنة إذا كان متصلاً
              if (isConnected) {
                syncManager.autoSync();
              }
            } catch (error: any) {
              console.error('❌ خطأ في حذف الطالب:', error);
              Alert.alert('خطأ', error.message || 'فشل في حذف الطالب');
            }
          },
        },
      ]
    );
  }, [isConnected, loadStudents]);

  // إغلاق النموذج
  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
    resetForm();
  }, [resetForm]);

  // تصدير تقرير PDF
  const handleExportPdf = useCallback(async () => {
    if (filteredStudents.length === 0) {
      Alert.alert('تنبيه', 'لا توجد بيانات طلاب لتصديرها');
      return;
    }

    try {
      await exportStudentsToPdf(filteredStudents);
    } catch (error: any) {
      console.error('❌ خطأ في تصدير PDF:', error);
      Alert.alert('خطأ', 'فشل في تصدير التقرير');
    }
  }, [filteredStudents]);

  // عرض عنصر طالب في القائمة
  const renderStudentItem = useCallback(({ item, index }: { item: Student; index: number }) => (
    <StudentItem
      item={item}
      index={index}
      onEdit={() => handleEditStudent(item)}
      onDelete={() => handleDeleteStudent(item.id, item.name)}
    />
  ), [handleEditStudent, handleDeleteStudent]);

  // مكون الحالة الفارغة
  const EmptyState = useCallback(() => (
    <View style={styles.emptyState}>
      <Ionicons name="school-outline" size={64} color="#d1d5db" />
      <Text style={styles.emptyStateText}>
        {searchQuery ? 'لا توجد نتائج للبحث' : 'لا توجد طلاب حتى الآن'}
      </Text>
      <Text style={styles.emptyStateSubtext}>
        {searchQuery ? `عن "${searchQuery}"` : 'ابدأ بإضافة طالب جديد'}
      </Text>
    </View>
  ), [searchQuery]);

  // مكون عداد النتائج
  const ResultsCount = useCallback(() => (
    <View style={styles.resultsContainer}>
      <Text style={styles.resultsText}>
        {filteredStudents.length} من {students.length} طالب
      </Text>
    </View>
  ), [filteredStudents.length, students.length]);

  // تحديد ما إذا كان النموذج صالحاً للحفظ
  const isFormValid = name.trim() && selectedOfficeUuid && selectedLevelUuid;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

      {/* رأس الشاشة */}
      <View style={styles.header}>
        <Text style={styles.title}>الطلاب</Text>
        <View style={styles.headerActions}>
          {/* زر تصدير التقرير */}
          <TouchableOpacity 
            style={styles.exportButton} 
            onPress={handleExportPdf}
            disabled={filteredStudents.length === 0}
          >
            <Ionicons name="document-text-outline" size={20} color="#6366f1" />
            <Text style={styles.exportButtonText}>تصدير</Text>
          </TouchableOpacity>

          {/* زر إضافة طالب جديد */}
          <TouchableOpacity style={styles.addButton} onPress={handleAddStudent}>
            <Ionicons name="person-add" size={20} color="white" />
            <Text style={styles.addButtonText}>طالب جديد</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* مؤشر حالة المزامنة */}
      <SyncStatus />

      {/* شريط البحث */}
      <SearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />

      {/* عداد النتائج */}
      {searchQuery.length > 0 && students.length > 0 && <ResultsCount />}

      {/* قائمة الطلاب */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>جاري تحميل البيانات...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredStudents}
          keyExtractor={item => item.uuid || item.id.toString()}
          renderItem={renderStudentItem}
          ListEmptyComponent={EmptyState}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* نموذج إضافة/تعديل طالب */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* رأس النموذج */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId ? 'تعديل بيانات الطالب' : 'إضافة طالب جديد'}
              </Text>
              <TouchableOpacity style={styles.closeButton} onPress={handleCloseModal}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {/* محتوى النموذج */}
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* اسم الطالب */}
              <View style={styles.fieldContainer}>
                <Text style={styles.label}>اسم الطالب *</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="أدخل اسم الطالب"
                  style={styles.input}
                  textAlign="right"
                  autoFocus
                />
              </View>

              {/* تاريخ الميلاد */}
              <View style={styles.fieldContainer}>
                <Text style={styles.label}>تاريخ الميلاد</Text>
                <DatePickerInput
                  value={birthDate}
                  onDateChange={setBirthDate}
                  placeholder="اختر تاريخ الميلاد"
                />
              </View>

              {/* رقم الهاتف */}
              <View style={styles.fieldContainer}>
                <Text style={styles.label}>رقم الهاتف</Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="أدخل رقم الهاتف"
                  style={styles.input}
                  keyboardType="phone-pad"
                  textAlign="right"
                />
              </View>

              {/* العنوان */}
              <View style={styles.fieldContainer}>
                <Text style={styles.label}>عنوان السكن</Text>
                <TextInput
                  value={address}
                  onChangeText={setAddress}
                  placeholder="أدخل عنوان السكن"
                  style={[styles.input, styles.textArea]}
                  multiline
                  numberOfLines={3}
                  textAlign="right"
                  textAlignVertical="top"
                />
              </View>

              {/* المركز */}
              <View style={styles.fieldContainer}>
                <Text style={styles.label}>المركز *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={selectedOfficeUuid}
                    onValueChange={setSelectedOfficeUuid}
                    style={styles.picker}
                  >
                    <Picker.Item label="اختر المركز..." value={null} />
                    {offices.map(office => (
                      <Picker.Item
                        key={office.uuid}
                        label={office.name}
                        value={office.uuid}
                      />
                    ))}
                  </Picker>
                </View>
              </View>

              {/* المستوى */}
              <View style={styles.fieldContainer}>
                <Text style={styles.label}>المستوى *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={selectedLevelUuid}
                    onValueChange={setSelectedLevelUuid}
                    style={styles.picker}
                  >
                    <Picker.Item label="اختر المستوى..." value={null} />
                    {levels.map(level => (
                      <Picker.Item
                        key={level.uuid}
                        label={level.name}
                        value={level.uuid}
                      />
                    ))}
                  </Picker>
                </View>
              </View>
            </ScrollView>

            {/* أزرار النموذج */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={handleCloseModal}
                disabled={saving}
              >
                <Text style={styles.cancelText}>إلغاء</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.modalButton, 
                  styles.saveButton,
                  (!isFormValid || saving) && styles.saveButtonDisabled
                ]}
                onPress={handleSaveStudent}
                disabled={!isFormValid || saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.saveText}>
                    {editingId ? 'تحديث' : 'إضافة'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#e0e7ff',
    borderWidth: 1,
    borderColor: '#6366f1',
    gap: 6,
  },
  exportButtonText: {
    color: '#6366f1',
    fontWeight: '600',
    fontSize: 14,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  addButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
  },
  resultsContainer: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  resultsText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  separator: {
    height: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  emptyStateText: {
    fontSize: 18,
    color: '#6b7280',
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    maxHeight: 400,
    paddingHorizontal: 20,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
    backgroundColor: 'white',
  },
  textArea: {
    minHeight: 80,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: 'white',
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  modalButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  saveButton: {
    backgroundColor: '#6366f1',
  },
  saveButtonDisabled: {
    backgroundColor: '#a5b4fc',
    opacity: 0.6,
  },
  cancelText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 16,
  },
  saveText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
});