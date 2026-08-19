import { logLogout } from '@/services/logger';
import { checkServerHealth, type ServerHealthStatus } from '@/services/server-health';
import { logoutUser } from '@/services/session-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EstadoAppScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [health, setHealth] = useState<ServerHealthStatus | null>(null);

  const loadHealth = useCallback(async () => {
    setIsLoading(true);
    try {
      const status = await checkServerHealth();
      setHealth(status);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  const handleLogout = async () => {
    await logLogout('Usuario cerró sesión desde estado de la app');
    await logoutUser(true);
    router.replace('/');
  };

  const rawText = health?.raw
    ? JSON.stringify(health.raw, null, 2)
    : health
      ? 'Sin cuerpo de respuesta'
      : '';

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
          <Text style={styles.headerTitle}>Estado de la app</Text>
        </View>
        <Pressable onPress={handleLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={18} color="#DCE2F1" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View
              style={[
                styles.statusDot,
                health?.isOnline ? styles.statusDotOnline : styles.statusDotOffline,
              ]}
            />
            <Text style={styles.statusTitle}>
              {isLoading
                ? 'Verificando...'
                : health?.isOnline
                  ? 'Servicio operativo'
                  : 'Servicio no disponible'}
            </Text>
          </View>

          <Text style={styles.statusMessage}>
            {isLoading ? 'Consultando /health' : health?.message}
          </Text>

          {health ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>HTTP</Text>
              <Text style={styles.metaValue}>{health.statusCode ?? '-'}</Text>
            </View>
          ) : null}
          {health?.latencyMs !== undefined ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Latencia</Text>
              <Text style={styles.metaValue}>{health.latencyMs} ms</Text>
            </View>
          ) : null}
          {health?.checkedAt ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Consultado</Text>
              <Text style={styles.metaValue}>
                {new Date(health.checkedAt).toLocaleTimeString('es-AR')}
              </Text>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.refreshButton, pressed && styles.refreshButtonPressed]}
            onPress={() => void loadHealth()}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#F2F5FB" />
            ) : (
              <Ionicons name="refresh-outline" size={18} color="#F2F5FB" />
            )}
            <Text style={styles.refreshButtonText}>Actualizar</Text>
          </Pressable>
        </View>

        <Text style={styles.rawLabel}>Respuesta de /health</Text>
        <View style={styles.rawBox}>
          {isLoading ? (
            <ActivityIndicator size="small" color="#926FA9" />
          ) : (
            <Text style={styles.rawText}>{rawText || 'Sin datos'}</Text>
          )}
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
  statusCard: {
    backgroundColor: '#1A2540',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E2D45',
    padding: 18,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusDotOnline: {
    backgroundColor: '#4BB543',
  },
  statusDotOffline: {
    backgroundColor: '#E25B5B',
  },
  statusTitle: {
    color: '#E8ECF7',
    fontSize: 18,
    fontWeight: '700',
  },
  statusMessage: {
    color: '#8A96AC',
    fontSize: 14,
    marginBottom: 14,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  metaLabel: {
    color: '#8A96AC',
    fontSize: 13,
  },
  metaValue: {
    color: '#C8D4EC',
    fontSize: 13,
    fontWeight: '600',
  },
  refreshButton: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3A5080',
    borderRadius: 8,
    paddingVertical: 12,
  },
  refreshButtonPressed: {
    backgroundColor: '#4A6090',
  },
  refreshButtonText: {
    color: '#F2F5FB',
    fontSize: 15,
    fontWeight: '700',
  },
  rawLabel: {
    color: '#B0BAD0',
    fontSize: 13,
    fontWeight: '600',
  },
  rawBox: {
    backgroundColor: '#121826',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E2D45',
    padding: 14,
    minHeight: 140,
  },
  rawText: {
    color: '#A0C4FF',
    fontSize: 13,
    fontFamily: 'monospace',
    lineHeight: 20,
  },
});
