import { logLogout } from '@/services/logger';
import { logoutUser } from '@/services/session-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const APP_NAME = Constants.expoConfig?.name ?? 'Gargano Logística';
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const NATIVE_VERSION = Constants.nativeAppVersion ?? APP_VERSION;
const BUILD_NUMBER = Constants.nativeBuildVersion ?? '-';

const VERSION_NOTES = [
  'Si no hay conexión, la confirmación, el rechazo, la entrega parcial y la foto quedan guardados en el teléfono y se reintentan solos.',
  'El analista puede cargar una imagen o un PDF desde la cámara o desde los archivos del teléfono.',
  'La foto se recorta dentro de la app, sin abrir el editor nativo.',
  'Al confirmar una entrega se muestra la animación del camión mientras se abre la cámara.',
];

export default function VersionAppScreen() {
  const navigation = useNavigation();
  const router = useRouter();

  const handleLogout = async () => {
    await logLogout('desde versión de la app');
    await logoutUser(true);
    router.replace('/');
  };

  const details = [
    { label: 'Aplicación', value: APP_NAME },
    { label: 'Versión', value: APP_VERSION },
    { label: 'Versión nativa', value: NATIVE_VERSION },
    { label: 'Compilación', value: BUILD_NUMBER },
    { label: 'Plataforma', value: Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
          style={styles.menuButton}
        >
          <Ionicons name="menu-outline" size={22} color="#DCE2F1" />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Versión de la app</Text>
        </View>
        <Pressable onPress={handleLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={18} color="#DCE2F1" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.versionCard}>
          <View style={styles.versionIcon}>
            <Ionicons name="information-circle-outline" size={28} color="#926FA9" />
          </View>
          <Text style={styles.versionLabel}>Versión actual</Text>
          <Text style={styles.versionNumber}>{APP_VERSION}</Text>
          <Text style={styles.versionHint}>{APP_NAME}</Text>
        </View>

        <View style={styles.detailsCard}>
          {details.map((item, index) => (
            <View
              key={item.label}
              style={[styles.detailRow, index < details.length - 1 && styles.detailRowBorder]}
            >
              <Text style={styles.detailLabel}>{item.label}</Text>
              <Text style={styles.detailValue}>{item.value}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.notesTitle}>Qué incluye esta versión</Text>
        <View style={styles.notesCard}>
          {VERSION_NOTES.map((note) => (
            <View key={note} style={styles.noteRow}>
              <Ionicons name="checkmark-circle-outline" size={16} color="#926FA9" />
              <Text style={styles.noteText}>{note}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0D1222',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E2D45',
  },
  menuButton: {
    padding: 6,
    borderRadius: 8,
  },
  headerTextWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E8ECF7',
  },
  logoutButton: {
    padding: 6,
    borderRadius: 8,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  versionCard: {
    backgroundColor: '#1A2540',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E2D45',
    padding: 22,
    alignItems: 'center',
  },
  versionIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#241C33',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  versionLabel: {
    color: '#8A96AC',
    fontSize: 13,
    fontWeight: '600',
  },
  versionNumber: {
    color: '#E8ECF7',
    fontSize: 36,
    fontWeight: '800',
    marginTop: 4,
  },
  versionHint: {
    color: '#C8D4EC',
    fontSize: 14,
    marginTop: 4,
  },
  detailsCard: {
    backgroundColor: '#1A2540',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E2D45',
    paddingHorizontal: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
  },
  detailRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#1E2D45',
  },
  detailLabel: {
    color: '#8A96AC',
    fontSize: 13,
    fontWeight: '600',
  },
  detailValue: {
    color: '#E8ECF7',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  notesTitle: {
    color: '#C8D4EC',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
  },
  notesCard: {
    backgroundColor: '#1A2540',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E2D45',
    padding: 16,
    gap: 14,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  noteText: {
    flex: 1,
    color: '#D0D8EE',
    fontSize: 14,
    lineHeight: 20,
  },
});
