// app/(tabs)/students.tsx
import { useEffect, useState, useCallback, useRef } from 'react';
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
  ActivityIndicator
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import SearchBar from '@/components/SearchBar';
import DataTable, { Column } from '@/components/DataTable'; // Import DataTable and Column type
import {
  getLocalStudents,
  insertLocalStudent,
  updateLocalStudent,
  deleteLocalStudent,
  updateLocalStudentSupabaseId,
  Student,
  markStudentAsSynced,
  markRemoteDeletedLocally,
  updateLocalStudentFieldsBySupabase,
  insertFromSupabaseIfNotExists,
  deleteLocalStudentByUuidAndMarkSynced,
  getStudentByUuid
} from '@/lib/studentsDb';
import { getLocalOffices } from '@/lib/officesDb';
import { getLocalLevels } from '@/lib/levelsDb';
import { getUnsyncedChanges, clearSyncedChange } from '@/lib/syncQueueDb';
import NetInfo from '@react-native-community/netinfo';
import { Picker } from '@react-native-picker/picker';
import DatePickerInput from '@/components/DatePickerInput';

const EmptyState = ({ loading }: { loading: boolean }) => (
  <View style={styles.emptyState}>
    {loading ? (
      <ActivityIndicator size="large" color="#6366f1" />
    ) : (
      <>
        <Ionicons name="folder-open-outline" size={64} color="#d1d5db" />
        <Text style={styles.emptyStateText}>لا توجد طلاب حتى الآن</Text>
        <Text style={styles.emptyStateSubtext}>ابدأ بإنشاء طالب جديد</Text>
      </>
    )}
  </View>
);

export default function StudentsScreen() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [offices, setOffices] = useState<any[]>([]);
  const [levels, setLevels] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // حقول النموذج
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [selectedOffice, setSelectedOffice] = useState<number | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  const initialLoadRef = useRef(false);

  useEffect(() => {
    let unsubscribeNetInfo: (() => void) | undefined;

    const initialize = async () => {
      const netState = await NetInfo.fetch();
      setIsConnected(netState.isConnected);

      unsubscribeNetInfo = NetInfo.addEventListener(state => {
        setIsConnected(state.isConnected);
        if (state.isConnected && !isSyncing) {
          syncDataWithSupabase();
        }
      });

      await Promise.all([fetchStudents(), loadOfficesAndLevels()]);

      if (netState.isConnected) {
        await syncDataWithSupabase();
      }
    };

    if (!initialLoadRef.current) {
      initialLoadRef.current = true;
      initialize();
    }

    return () => {
      if (unsubscribeNetInfo) {
        unsubscribeNetInfo();
      }
    };
  }, [syncDataWithSupabase]);

  const loadOfficesAndLevels = async () => {
    try {
      const [officesData, levelsData] = await Promise.all([
        getLocalOffices(),
        getLocalLevels(),
      ]);
      setOffices(officesData);
      setLevels(levelsData);
    } catch (error) {
      console.error('❌ خطأ في تحميل المراكز والمستويات:', error);
      Alert.alert('خطأ', 'فشل في تحميل بيانات المراكز أو المستويات.');
    }
  };

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const localData = await getLocalStudents();
      setStudents(localData);
    } catch (error: any) {
      console.error('❌ خطأ في جلب بيانات الطلاب:', error);
      Alert.alert('خطأ', 'فشل في جلب بيانات الطلاب من قاعدة البيانات المحلية.');
    } finally {
      setLoading(false);
    }
  }, []);

  const resetForm = () => {
    setName('');
    setBirthDate('');
    setPhone('');
    setAddress('');
    setSelectedOffice(null);
    setSelectedLevel(null);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('خطأ', 'يرجى إدخال اسم الطالب.');
      return;
    }
    if (selectedOffice === null) {
      Alert.alert('خطأ', 'يرجى اختيار المركز.');
      return;
    }
    if (selectedLevel === null) {
      Alert.alert('خطأ', 'يرجى اختيار المستوى.');
      return;
    }

    try {
      const studentData = {
        name: name.trim(),
        birth_date: birthDate || undefined,
        phone: phone || undefined,
        address: address || undefined,
        office_id: selectedOffice,
        level_id: selectedLevel,
      };

      if (editingId) {
        await updateLocalStudent(editingId, studentData);
      } else {
        await insertLocalStudent(studentData);
      }

      setModalVisible(false);
      resetForm();
      await fetchStudents();

      if (isConnected) {
        await syncDataWithSupabase();
      }
    } catch (error: any) {
      console.error('❌ خطأ أثناء حفظ الطالب:', error);
      Alert.alert('خطأ', error.message || 'حدث خطأ غير متوقع أثناء الحفظ.');
    }
  };

  const handleEdit = (student: Student) => {
    setEditingId(student.id);
    setName(student.name);
    setBirthDate(student.birth_date || '');
    setPhone(student.phone || '');
    setAddress(student.address || '');
    setSelectedOffice(student.office_id);
    setSelectedLevel(student.level_id);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    Alert.alert(
      'تأكيد الحذف',
      'هل أنت متأكد أنك تريد حذف هذا الطالب؟ سيتم حذفه من الجهاز و من السحابة.',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLocalStudent(id);
              await fetchStudents();

              if (isConnected) {
                await syncDataWithSupabase();
              }
            } catch (error: any) {
              console.error('❌ خطأ في حذف الطالب:', error);
              Alert.alert('خطأ في الحذف', error.message || 'حدث خطأ أثناء حذف الطالب.');
            }
          },
        },
      ]
    );
  };

  const syncDataWithSupabase = useCallback(async () => {
    if (!isConnected) {
      console.log('📡 غير متصل بالإنترنت، تخطّي المزامنة.');
      return;
    }
    if (isSyncing) {
      console.log('🔄 المزامنة جارية بالفعل، تخطّي طلب جديد.');
      return;
    }

    setIsSyncing(true);
    console.log('🔄 بدء المزامنة...');
    try {
      const unsyncedChanges = await getUnsyncedChanges();
  if (unsyncedChanges.length > 0) {
    console.log(`🔄 ${unsyncedChanges.length} تغييرات غير مزامنة موجودة.`);
    // ... معالجة التغييرات كما هو مكتوب
  } else {
    console.log('✅ لا توجد تغييرات غير مزامنة.');
  }

      for (const change of unsyncedChanges) {
        if (change.entity !== 'students') continue;

        const payload = JSON.parse(change.payload);
        let syncSuccessful = false;

        try {
          switch (change.operation) {
            case 'INSERT':
              const { data: insertData, error: insertError } = await supabase
                .from('students')
                .insert({
                  uuid: payload.uuid,
                  name: payload.name,
                  birth_date: payload.birth_date || null,
                  phone: payload.phone || null,
                  address: payload.address || null,
                  office_id: payload.office_id,
                  level_id: payload.level_id,
                  created_at: payload.created_at,
                  updated_at: payload.updated_at,
                  is_synced: true,
                })
                .select('id');

              if (insertError) {
                if (insertError.code === '23505' && insertError.message.includes('students_name_key')) {
                  const localStudent = await getStudentByUuid(payload.uuid);
                  if (localStudent) {
                    Alert.alert(
                      'تنبيه تكرار',
                      `الطالب "${payload.name}" موجود بالفعل في السحابة. هل تريد حذف الإدخال المحلي المتكرر؟`,
                      [
                        { text: 'إلغاء', style: 'cancel' },
                        {
                          text: 'حذف المحلي',
                          style: 'destructive',
                          onPress: async () => {
                            await deleteLocalStudentByUuidAndMarkSynced(payload.uuid);
                            await clearSyncedChange(change.id);
                            await fetchStudents();
                          },
                        },
                      ]
                    );
                  }
                  console.warn(`⚠️ تكرار اسم الطالب "${payload.name}" في Supabase. UUID: ${payload.uuid}`);
                  continue;
                }
                throw insertError;
              }

              if (insertData?.[0]?.id) {
                await updateLocalStudentSupabaseId(change.entity_local_id, payload.uuid, insertData[0].id);
                await markStudentAsSynced(change.entity_local_id);
                syncSuccessful = true;
              }
              break;

            case 'UPDATE':
              const { error: updateError } = await supabase
                .from('students')
                .update({
                  name: payload.name,
                  birth_date: payload.birth_date || null,
                  phone: payload.phone || null,
                  address: payload.address || null,
                  office_id: payload.office_id,
                  level_id: payload.level_id,
                  updated_at: payload.updated_at,
                  is_synced: true,
                })
                .eq('uuid', payload.uuid);

              if (updateError) throw updateError;

              await markStudentAsSynced(change.entity_local_id);
              syncSuccessful = true;
              break;

            case 'DELETE':
              const { error: deleteError } = await supabase
                .from('students')
                .update({
                  deleted_at: payload.deleted_at,
                  updated_at: payload.updated_at,
                  is_synced: true,
                })
                .eq('uuid', payload.uuid);

              if (deleteError) throw deleteError;

              await markStudentAsSynced(change.entity_local_id);
              syncSuccessful = true;
              break;

            default:
              console.warn(`⁉️ عملية غير معروفة في قائمة الانتظار: ${change.operation}`);
              break;
          }

          if (syncSuccessful) {
            await clearSyncedChange(change.id);
            console.log(`✅ تمت مزامنة ${change.operation} للطالب UUID: ${payload.uuid}`);
          }
        } catch (error: any) {
          console.error(`❌ خطأ أثناء مزامنة ${change.operation} للطالب UUID: ${payload.uuid}:`, error.message);
        }
      }

      await fetchRemoteStudentsAndMerge();
      await fetchStudents();
      console.log('✅ انتهت المزامنة بنجاح.');
    } catch (error: any) {
      console.error('❌ خطأ غير متوقع أثناء عملية المزامنة:', error.message);
      Alert.alert('خطأ في المزامنة', 'حدث خطأ أثناء مزامنة البيانات مع Supabase.');
    } finally {
      setIsSyncing(false);
    }
  }, [isConnected, fetchStudents, isSyncing]);


  const fetchRemoteStudentsAndMerge = useCallback(async () => {
    if (!isConnected) {
      console.log('📡 غير متصل، تخطّي جلب الطلاب البعيدين.');
      return;
    }
    try {
      const { data: remoteStudents, error } = await supabase
        .from('students')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      const localStudents = await getLocalStudents();

      await Promise.all(
        remoteStudents.map(async remoteStudent => {
          if (remoteStudent.deleted_at) {
            const existingLocal = localStudents.find(l => l.uuid === remoteStudent.uuid);
            if (existingLocal && !existingLocal.deleted_at) {
              await markRemoteDeletedLocally(remoteStudent.id, remoteStudent.deleted_at);
            }
            return;
          }

          const localStudent = localStudents.find(l => l.uuid === remoteStudent.uuid);

          if (!localStudent) {
            await insertFromSupabaseIfNotExists(remoteStudent);
          } else {
            const remoteUpdate = new Date(remoteStudent.updated_at || remoteStudent.created_at || 0).getTime();
            const localUpdate = new Date(localStudent.updated_at || localStudent.created_at || 0).getTime();

            if (remoteUpdate > localUpdate) {
              await updateLocalStudentFieldsBySupabase(remoteStudent);
            }
          }
        })
      );

      await fetchStudents();
    } catch (error: any) {
      console.error('❌ Error fetching remote students:', error.message);
      Alert.alert('خطأ في جلب بيانات Supabase', error.message);
    }
  }, [isConnected, fetchStudents]);

  // تعريف الأعمدة لـ DataTable
  const studentTableColumns: Column<Student>[] = [
    {
      key: 'name',
      label: 'الاسم',
      sortable: true,
      searchable: true,
      minWidth: 150, // تحديد الحد الأدنى للعرض
      align: 'right',
    },
    {
      key: 'birth_date',
      label: 'تاريخ الميلاد',
      sortable: true,
      searchable: true,
      minWidth: 130,
      render: (item) => <Text style={styles.studentDetail}>{item.birth_date || 'غير محدد'}</Text>,
      align: 'right',
    },
    {
      key: 'phone',
      label: 'الهاتف',
      searchable: true,
      minWidth: 120,
      render: (item) => <Text style={styles.studentDetail}>{item.phone || 'لا يوجد'}</Text>,
      align: 'right',
    },
    {
      key: 'address', // إضافة عمود العنوان ليتيح التمرير الأفقي
      label: 'العنوان',
      searchable: true,
      minWidth: 200, // يمكن أن يكون العنوان طويلاً
      render: (item) => <Text style={styles.studentDetail}>{item.address || 'لا يوجد'}</Text>,
      align: 'right',
    },
    {
      key: 'office_name',
      label: 'المركز',
      sortable: true,
      searchable: true,
      minWidth: 100,
      render: (item) => <Text style={styles.studentDetail}>{item.office_name || 'غير محدد'}</Text>,
      align: 'right',
    },
    {
      key: 'level_name',
      label: 'المستوى',
      sortable: true,
      searchable: true,
      minWidth: 100,
      render: (item) => <Text style={styles.studentDetail}>{item.level_name || 'غير محدد'}</Text>,
      align: 'right',
    },
    {
      key: 'operation_type',
      label: 'الحالة',
      render: (item) => (
        <Text style={styles.studentDetail}>
          {item.operation_type ? (
            <Text style={{ color: 'orange', fontWeight: 'bold' }}>معلق ({item.operation_type})</Text>
          ) : (
            'متزامن'
          )}
        </Text>
      ),
      align: 'center',
      minWidth: 120,
    },
  ];


  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

      <View style={styles.header}>
        <Text style={styles.title}>الطلاب</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            setModalVisible(true);
            resetForm();
          }}
        >
          <Ionicons name="add-circle" size={24} color="white" />
          <Text style={styles.addButtonText}>طالب جديد</Text>
        </TouchableOpacity>
      </View>

      {/* شريط حالة الاتصال والمزامنة */}
      <View style={styles.statusContainer}>
        {isConnected !== null && (
          <View style={[styles.connectionStatus, { backgroundColor: isConnected ? '#dcfce7' : '#fee2e2' }]}>
            <Text style={{ color: isConnected ? '#16a34a' : '#dc2626', fontWeight: 'bold' }}>
              {isConnected ? 'متصل بالإنترنت' : 'غير متصل بالإنترنت'}
            </Text>
          </View>
        )}
        {isSyncing && (
          <View style={styles.syncStatus}>
            <ActivityIndicator size="small" color="#6366f1" />
            <Text style={styles.syncText}>جاري المزامنة...</Text>
          </View>
        )}
      </View>

      {/* استخدام مكون DataTable الجديد */}
      <DataTable
        data={students}
        columns={studentTableColumns}
        onRefresh={async () => {
          await fetchStudents();
          await syncDataWithSupabase();
        }}
        refreshing={loading || isSyncing}
        emptyStateComponent={<EmptyState loading={loading} />}
        actions={[
          {
            label: 'تعديل',
            iconName: 'create-outline',
            onPress: handleEdit,
            style: styles.editButton,
            textStyle: styles.editText,
          },
          {
            label: 'حذف',
            iconName: 'trash-outline',
            onPress: (item) => handleDelete(item.id!),
            style: styles.deleteButton,
            textStyle: styles.deleteText,
          },
        ]}
      />

      {/* Modal for Add/Edit Student (يبقى كما هو) */}
      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setModalVisible(false);
          resetForm();
        }}
      >
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingId ? 'تعديل الطالب' : 'إنشاء طالب جديد'}</Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => {
                    setModalVisible(false);
                    resetForm();
                  }}
                >
                  <Ionicons name="close" size={24} color="#6b7280" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <Text style={styles.label}>اسم الطالب *</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="أدخل اسم الطالب"
                  style={styles.input}
                  textAlign={Platform.OS === 'android' ? 'right' : 'left'}
                />

                <Text style={styles.label}>تاريخ الميلاد</Text>
                <DatePickerInput
                  value={birthDate}
                  onDateChange={setBirthDate}
                  placeholder="تاريخ الميلاد (YYYY-MM-DD)"
                />

                <Text style={styles.label}>رقم الهاتف</Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="أدخل رقم الهاتف"
                  style={styles.input}
                  keyboardType="phone-pad"
                  textAlign={Platform.OS === 'android' ? 'right' : 'left'}
                />

                <Text style={styles.label}>عنوان السكن</Text>
                <TextInput
                  value={address}
                  onChangeText={setAddress}
                  placeholder="أدخل عنوان السكن"
                  style={styles.input}
                  textAlign={Platform.OS === 'android' ? 'right' : 'left'}
                />

                <Text style={styles.label}>المركز *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={selectedOffice}
                    onValueChange={(itemValue) => setSelectedOffice(itemValue)}
                    itemStyle={styles.pickerItem}
                  >
                    <Picker.Item label="اختر المركز..." value={null} />
                    {offices.map(office => (
                      <Picker.Item
                        key={office.supabase_id}
                        label={office.name}
                        value={office.supabase_id}
                      />
                    ))}
                  </Picker>
                </View>

                <Text style={styles.label}>المستوى *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={selectedLevel}
                    onValueChange={(itemValue) => setSelectedLevel(itemValue)}
                    itemStyle={styles.pickerItem}
                  >
                    <Picker.Item label="اختر المستوى..." value={null} />
                    {levels.map(level => (
                      <Picker.Item
                        key={level.supabase_id}
                        label={level.name}
                        value={level.supabase_id}
                      />
                    ))}
                  </Picker>
                </View>
              </View>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setModalVisible(false);
                    resetForm();
                  }}
                >
                  <Text style={styles.cancelText}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleSave}>
                  <Text style={styles.saveText}>{editingId ? 'تحديث' : 'إنشاء'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
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
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  addButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  statusContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f0f4f8',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  connectionStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  syncStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#e0e7ff',
  },
  syncText: {
    color: '#6366f1',
    fontWeight: 'bold',
    fontSize: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    flexGrow: 1,
  },
  studentDetail: {
    fontSize: 13,
    color: '#475569',
  },
  editButton: { backgroundColor: '#eff6ff' },
  deleteButton: { backgroundColor: '#fef2f2' },
  editText: { color: '#3b82f6', fontSize: 12, fontWeight: '600' },
  deleteText: { color: '#ef4444', fontSize: 12, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  modalScroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e293b' },
  closeButton: { padding: 4 },
  modalBody: { padding: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: '#1e293b',
    textAlign: 'right',
    marginBottom: 12,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
  },
  pickerItem: {
    textAlign: 'right',
    height: 120,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  cancelButton: { backgroundColor: '#f3f4f6' },
  saveButton: { backgroundColor: '#6366f1' },
  cancelText: { color: '#374151', fontWeight: '600' },
  saveText: { color: 'white', fontWeight: '600' },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: { fontSize: 18, color: '#6b7280', marginTop: 16 },
  emptyStateSubtext: { fontSize: 14, color: '#9ca3af', marginTop: 4 },
});
