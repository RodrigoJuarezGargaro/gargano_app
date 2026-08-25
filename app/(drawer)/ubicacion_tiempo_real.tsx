import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { logError, logLogout } from '@/services/logger';
import { clearUserSession } from '@/services/session-storage';

const API_TIMEOUT_MS = 30000;
const AUTO_REFRESH_INTERVAL = 30000; // 30 segundos

type UbicacionChofer = {
  usuario: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  timestamp: string;
  tiempo_transcurrido: string;
};

export default function UbicacionTiempoRealScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [userRol, setUserRol] = useState('');
  const [ubicaciones, setUbicaciones] = useState<UbicacionChofer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);

  useEffect(() => {
    const loadSession = async () => {
      const session = await AsyncStorage.getItem('userSession');
      if (!session) {
        router.replace('/');
        return;
      }

      const sessionData = JSON.parse(session);
      const rol = String(sessionData.perfil_nombre || sessionData.rol || '').trim().toLowerCase();
      setUserRol(rol);

      // Solo admins pueden ver esta pantalla
      if (rol !== 'admin') {
        Toast.show({
          type: 'error',
          text1: 'Acceso denegado',
          text2: 'No tienes permisos para ver esta pantalla',
        });
        router.replace('/hoja_ruta');
        return;
      }

      await fetchUbicaciones();
    };

    loadSession();
  }, [router]);

  // Auto-refresh cada 30 segundos (solo para admin)
  useEffect(() => {
    if (userRol === 'admin') {
      const interval = setInterval(() => {
        fetchUbicaciones(true); // Silent refresh
      }, AUTO_REFRESH_INTERVAL);

      return () => clearInterval(interval);
    }
  }, [userRol]);

  const fetchUbicaciones = async (silent: boolean = false) => {
    console.log(`[UbicacionTiempoReal] ${silent ? 'Auto-refreshing' : 'Fetching'} ubicaciones...`);
    if (!silent) {
      setIsLoading(true);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

      // Obtener ubicaciones de TODOS los choferes activos
      const response = await fetch(
        'https://www.gargano.com.ar/laravel_backend_app/public/api/obtener_ubicaciones_todos_choferes',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Error ${response.status}`);
      }

      const data = await response.json();
      console.log('[UbicacionTiempoReal] Respuesta del servidor:', data);
      
      if (data && data.success && data.ubicaciones && Array.isArray(data.ubicaciones)) {
        // Procesar TODAS las ubicaciones recibidas
        const ubicacionesArray: UbicacionChofer[] = data.ubicaciones.map((ub: any) => ({
          usuario: ub.usuario || 'Chofer desconocido',
          latitude: parseFloat(ub.latitude) || 0,
          longitude: parseFloat(ub.longitude) || 0,
          accuracy: parseFloat(ub.accuracy) || 0,
          speed: ub.speed ? parseFloat(ub.speed) : null,
          heading: ub.heading ? parseFloat(ub.heading) : null,
          timestamp: ub.timestamp || ub.fecha_creacion || '',
          tiempo_transcurrido: ub.tiempo_transcurrido || 'desconocido',
        }));
        
        setUbicaciones(ubicacionesArray);
        setLastUpdateTime(new Date());
        
        if (!silent) {
          Toast.show({
            type: 'success',
            text1: 'Ubicaciones actualizadas',
            text2: `${ubicacionesArray.length} chofer${ubicacionesArray.length !== 1 ? 'es' : ''} activo${ubicacionesArray.length !== 1 ? 's' : ''}`,
            position: 'bottom',
          });
        }
      } else {
        setUbicaciones([]);
        if (!silent) {
          Toast.show({
            type: 'info',
            text1: 'Sin datos',
            text2: 'No se encontraron choferes con ubicación activa',
          });
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('Timeout obteniendo ubicaciones');
        await logError('UbicacionTiempoReal', 'obtener_ubicacion_chofer', {
          error: 'Timeout - servidor tardó más de 30 segundos',
        });
        if (!silent) {
          Toast.show({
            type: 'error',
            text1: 'Timeout',
            text2: 'El servidor tardó demasiado en responder',
          });
        }
      } else {
        console.error('Error obteniendo ubicaciones:', error);
        await logError('UbicacionTiempoReal', 'obtener_ubicacion_chofer', {
          error: error instanceof Error ? error.message : String(error),
        });
        if (!silent) {
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'No se pudo obtener la ubicación',
          });
        }
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchUbicaciones();
  };

  const handleLogout = async () => {
    await logLogout('desde ubicación en tiempo real');
    await clearUserSession();
    router.replace('/');
  };

  const getMarkerColor = (tiempoTranscurrido: string): string => {
    // Parsear tiempo transcurrido (ej: "5 minutos")
    const match = tiempoTranscurrido.match(/(\d+)\s*(minuto|hora|día)/);
    if (!match) return '#4BB543'; // Verde por defecto

    const valor = parseInt(match[1]);
    const unidad = match[2];

    if (unidad === 'minuto' && valor < 5) return '#4BB543'; // Verde: < 5 min
    if (unidad === 'minuto' && valor < 15) return '#FFA500'; // Naranja: 5-15 min
    return '#E25B5B'; // Rojo: > 15 min
  };

  const centerRegion = ubicaciones.length > 0
    ? {
        latitude: ubicaciones.reduce((sum, u) => sum + u.latitude, 0) / ubicaciones.length,
        longitude: ubicaciones.reduce((sum, u) => sum + u.longitude, 0) / ubicaciones.length,
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
      }
    : {
        latitude: -34.6037,
        longitude: -58.3816,
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
      };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
          style={styles.menuButton}
        >
          <Ionicons name="menu-outline" size={22} color="#DCE2F1" />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Ubicación en Tiempo Real</Text>
        </View>
        <Pressable onPress={handleLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={18} color="#DCE2F1" />
        </Pressable>
      </View>

      {/* Info Bar */}
      <View style={styles.infoBar}>
        <View style={styles.infoLeft}>
          <Ionicons name="people-outline" size={16} color="#A0C4FF" />
          <Text style={styles.infoText}>
            {ubicaciones.length} chofer{ubicaciones.length !== 1 ? 'es' : ''} activo{ubicaciones.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <Pressable onPress={handleRefresh} style={styles.refreshButton} disabled={isRefreshing}>
          <Ionicons 
            name="refresh-outline" 
            size={16} 
            color={isRefreshing ? '#6A7A96' : '#A0C4FF'} 
          />
          <Text style={[styles.refreshText, isRefreshing && styles.refreshTextDisabled]}>
            Actualizar
          </Text>
        </Pressable>
      </View>

      {lastUpdateTime && (
        <View style={styles.lastUpdateBar}>
          <Ionicons name="time-outline" size={12} color="#8A96AC" />
          <Text style={styles.lastUpdateText}>
            Última actualización: {lastUpdateTime.toLocaleTimeString('es-AR', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </Text>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#926FA9" />
          <Text style={styles.loadingText}>Cargando ubicaciones...</Text>
        </View>
      ) : (
        <View style={styles.content}>
          {/* Mapa */}
          <View style={styles.mapContainer}>
            <MapView
              provider={PROVIDER_GOOGLE}
              style={styles.map}
              initialRegion={centerRegion}
              region={centerRegion}
              showsUserLocation={false}
              showsMyLocationButton={true}
              showsCompass={true}
              showsTraffic={false}
            >
              {ubicaciones.map((ubicacion, index) => (
                <Marker
                  key={`${ubicacion.usuario}-${index}`}
                  coordinate={{
                    latitude: ubicacion.latitude,
                    longitude: ubicacion.longitude,
                  }}
                  title={ubicacion.usuario}
                  description={`Última actualización: ${ubicacion.tiempo_transcurrido}`}
                  pinColor={getMarkerColor(ubicacion.tiempo_transcurrido)}
                >
                  <View style={styles.markerContainer}>
                    <View style={[styles.markerDot, { backgroundColor: getMarkerColor(ubicacion.tiempo_transcurrido) }]} />
                  </View>
                </Marker>
              ))}
            </MapView>
          </View>

          {/* Lista de Choferes */}
          <ScrollView
            style={styles.listContainer}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor="#926FA9"
              />
            }
          >
            {ubicaciones.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="location-outline" size={48} color="#4A5A76" />
                <Text style={styles.emptyStateText}>No hay choferes con ubicación activa</Text>
              </View>
            ) : (
              ubicaciones.map((ubicacion, index) => (
                <View key={`${ubicacion.usuario}-${index}`} style={styles.choferCard}>
                  <View style={styles.choferHeader}>
                    <View style={styles.choferLeft}>
                      <Ionicons name="person-circle-outline" size={24} color="#926FA9" />
                      <View style={styles.choferInfo}>
                        <Text style={styles.choferNombre}>{ubicacion.usuario}</Text>
                        <Text style={styles.choferTiempo}>
                          Hace {ubicacion.tiempo_transcurrido}
                        </Text>
                      </View>
                    </View>
                    <View style={[
                      styles.statusDot,
                      { backgroundColor: getMarkerColor(ubicacion.tiempo_transcurrido) }
                    ]} />
                  </View>
                  {/* Detalles técnicos: Solo para Admin */}
                  {userRol === 'admin' && (
                    <View style={styles.choferDetails}>
                      <View style={styles.detailRow}>
                        <Ionicons name="location-outline" size={14} color="#6A8AAC" />
                        <Text style={styles.detailText}>
                          {ubicacion.latitude.toFixed(6)}, {ubicacion.longitude.toFixed(6)}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Ionicons name="radio-outline" size={14} color="#6A8AAC" />
                        <Text style={styles.detailText}>
                          Precisión: {ubicacion.accuracy.toFixed(0)}m
                        </Text>
                      </View>
                      {ubicacion.speed !== null && ubicacion.speed > 0 && (
                        <View style={styles.detailRow}>
                          <Ionicons name="speedometer-outline" size={14} color="#6A8AAC" />
                          <Text style={styles.detailText}>
                            {(ubicacion.speed * 3.6).toFixed(0)} km/h
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      )}
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
    paddingVertical: 12,
    backgroundColor: '#1A2332',
    borderBottomWidth: 1,
    borderBottomColor: '#2A3442',
  },
  menuButton: {
    padding: 8,
  },
  headerTextWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#DCE2F1',
  },
  logoutButton: {
    padding: 8,
  },
  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#151D2E',
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#A0C4FF',
    fontWeight: '500',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1A2332',
    borderRadius: 6,
  },
  refreshText: {
    fontSize: 13,
    color: '#A0C4FF',
  },
  refreshTextDisabled: {
    color: '#6A7A96',
  },
  lastUpdateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0F1520',
  },
  lastUpdateText: {
    fontSize: 12,
    color: '#8A96AC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#8A96AC',
  },
  content: {
    flex: 1,
  },
  mapContainer: {
    height: 300,
    borderBottomWidth: 1,
    borderBottomColor: '#2A3442',
  },
  map: {
    flex: 1,
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  listContainer: {
    flex: 1,
    backgroundColor: '#0D1222',
  },
  emptyState: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6A7A96',
  },
  choferCard: {
    backgroundColor: '#151D2E',
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2A3442',
  },
  choferHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  choferLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  choferInfo: {
    flex: 1,
  },
  choferNombre: {
    fontSize: 15,
    fontWeight: '600',
    color: '#DCE2F1',
  },
  choferTiempo: {
    fontSize: 12,
    color: '#8A96AC',
    marginTop: 2,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  choferDetails: {
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    color: '#A0B4CC',
  },
});
