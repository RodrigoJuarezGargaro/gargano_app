import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

/**
 * Nombre de la tarea de tracking en segundo plano
 */
export const LOCATION_TRACKING_TASK = 'background-location-tracking';

/**
 * Intervalo de actualización en milisegundos (30 segundos para testing)
 */
const UPDATE_INTERVAL = 30 * 1000; // 30 segundos (cambiar a 2 * 60 * 1000 en producción)

/**
 * Distancia mínima en metros para actualizar (10m para testing)
 */
const MIN_DISTANCE = 10; // 10 metros (cambiar a 100 en producción)

/**
 * Configuración de precisión para Android
 * - BestForNavigation: Máxima precisión, ideal para navegación vehicular
 * - Highest: Alta precisión con GPS
 * - Balanced: Equilibrio entre precisión y batería
 */
const LOCATION_ACCURACY = Location.Accuracy.BestForNavigation;

/**
 * Tipo de datos de ubicación enviados al servidor
 */
export type LocationUpdate = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
  speed: number | null;
  heading: number | null;
};

/**
 * Define la tarea de tracking en segundo plano
 * Esta función se ejecutará periódicamente aunque la app esté en segundo plano
 */
TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }) => {
  console.log('[BackgroundLocation] 🔄 Task ejecutada -', new Date().toLocaleTimeString());
  
  if (error) {
    console.error('[BackgroundLocation] ❌ Error en task:', error);
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    
    if (locations && locations.length > 0) {
      // CRÍTICO: Tomar SIEMPRE la ÚLTIMA ubicación (la más reciente)
      // El SO puede enviar un lote de ubicaciones acumuladas
      const location = locations[locations.length - 1];
      
      console.log(`[BackgroundLocation] 📦 Recibidas ${locations.length} ubicaciones en el lote`);
      
      try {
        // Obtener el usuario actual
        const userSession = await AsyncStorage.getItem('userSession');
        if (!userSession) {
          console.warn('[BackgroundLocation] No hay sesión de usuario');
          return;
        }

        const sessionData = JSON.parse(userSession);
        const userName = sessionData.nombre || sessionData.login;
        const userRol = String(sessionData.perfil_nombre || sessionData.rol || '').trim().toLowerCase();

        // MODO TESTING: Se comenta la validación de rol para permitir tracking a todos los usuarios
        // if (userRol !== 'chofer') {
        //   console.log('[BackgroundLocation] Usuario no es chofer, no se envía ubicación');
        //   return;
        // }

        const locationUpdate: LocationUpdate = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          timestamp: location.timestamp,
          speed: location.coords.speed,
          heading: location.coords.heading,
        };

        // ===== COORDENADAS CAPTURADAS =====
        // console.log('🌍 ===== NUEVA UBICACIÓN CAPTURADA =====');
        // console.log('📍 Latitud:', locationUpdate.latitude);
        // console.log('📍 Longitud:', locationUpdate.longitude);
        // console.log('🎯 Precisión:', locationUpdate.accuracy, 'metros');
        // console.log('⏰ Timestamp:', new Date(locationUpdate.timestamp).toLocaleString());
        // console.log('🚗 Velocidad:', locationUpdate.speed, 'm/s');
        // console.log('🧭 Dirección:', locationUpdate.heading, 'grados');
        // console.log('👤 Usuario:', userName, '(Rol:', userRol + ')');
        // console.log('=====================================');
        
        // console.log('[BackgroundLocation] Nueva ubicación capturada:', {
        //   lat: locationUpdate.latitude,
        //   lng: locationUpdate.longitude,
        //   accuracy: locationUpdate.accuracy,
        //   timestamp: new Date(locationUpdate.timestamp).toLocaleString(),
        // });

        // Enviar la ubicación al servidor
        await sendLocationToServer(userName, locationUpdate);

        // Guardar última ubicación en AsyncStorage para debugging
        await AsyncStorage.setItem('lastLocationUpdate', JSON.stringify({
          ...locationUpdate,
          sentAt: new Date().toISOString(),
        }));

      } catch (err) {
        console.error('[BackgroundLocation] Error procesando ubicación:', err);
      }
    }
  } else {
    console.log('[BackgroundLocation] ⚠️ Task ejecutada pero sin datos de ubicación');
  }
});

/**
 * Envía la ubicación al servidor
 */
async function sendLocationToServer(userName: string, location: LocationUpdate): Promise<void> {
  const payload = {
    usuario: userName,
    latitude: location.latitude.toString(),
    longitude: location.longitude.toString(),
    accuracy: location.accuracy?.toString() ?? '',
    speed: location.speed?.toString() ?? '',
    heading: location.heading?.toString() ?? '',
  };
  
  console.log('[BackgroundLocation] 📤 Enviando al servidor:', payload);
  
  try {
    // Timeout de 10 segundos para evitar bloquear el tracking
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(
      'https://gargano-proxy.vercel.app/api/proxy?endpoint=guardar_ubicacion_chofer',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }
    );
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('[BackgroundLocation] ❌ Error HTTP:', response.status);
      // No lanzar error para no detener el tracking
      return;
    }

    const data = await response.json();
    console.log('[BackgroundLocation] ✅ Respuesta del servidor:', data);

  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error('[BackgroundLocation] ⏱️ Timeout - servidor tardó más de 10s (tracking continúa)');
    } else {
      console.error('[BackgroundLocation] ❌ Error en fetch (tracking continúa):', error.message);
    }
    // No lanzar error para no detener el tracking
  }
}

/**
 * Inicia el tracking de ubicación en segundo plano
 */
export async function startLocationTracking(): Promise<boolean> {
  try {
    // Verificar si ya está corriendo
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK);
    if (isTracking) {
      console.log('[BackgroundLocation] Tracking ya está activo');
      return true;
    }
    
    // Verificar que la task esté definida
    const isTaskDefined = await TaskManager.isTaskDefined(LOCATION_TRACKING_TASK);
    console.log('[BackgroundLocation] ¿Task definida?', isTaskDefined);
    if (!isTaskDefined) {
      console.error('[BackgroundLocation] ❌ La task NO está definida. Hay un error en TaskManager.defineTask');
      return false;
    }

    // Solicitar permisos de ubicación en segundo plano
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      console.error('[BackgroundLocation] Permiso de ubicación en primer plano denegado');
      return false;
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      console.error('[BackgroundLocation] Permiso de ubicación en segundo plano denegado');
      return false;
    }

    // Iniciar tracking
    await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
      // 1. Máxima precisión para navegación vehicular
      accuracy: LOCATION_ACCURACY,
      
      timeInterval: UPDATE_INTERVAL,
      distanceInterval: MIN_DISTANCE,
      
      // 2. Eliminar deferredUpdates - hace que el SO guarde ubicaciones en caché
      // y las entregue en lote en lugar de tiempo real
      deferredUpdatesInterval: 0,
      deferredUpdatesDistance: 0,
      
      // 3. ANDROID: Configuración crítica para mantener el servicio vivo
      foregroundService: {
        notificationTitle: '🚛 Seguimiento de ruta activo',
        notificationBody: 'Gargano Logística está rastreando tu ubicación para la hoja de ruta',
        notificationColor: '#673E8A',
        // CRÍTICO: Evita que Android mate el proceso en segundo plano
        killServiceOnDestroy: false,
      },
      
      // NO pausar cuando el dispositivo está quieto
      pausesUpdatesAutomatically: false,
      
      // iOS: Mostrar indicador de ubicación en segundo plano
      showsBackgroundLocationIndicator: true,
      
      // 4. Tipo de actividad optimizado para navegación vehicular
      activityType: Location.ActivityType.AutomotiveNavigation,
      
      // 5. Mantener actualizaciones aunque la app esté en background
      mayShowUserSettingsDialog: true,
      
      // 6. Prioridad alta para evitar que Android lo suspenda
      priority: Location.LocationTaskPriority.HighAccuracy,
    });

    console.log('🚀 ===== TRACKING INICIADO =====');
    console.log('⏱️  Intervalo: cada 30 segundos');
    console.log('📏 Distancia mínima: 10 metros');
    console.log('🎯 Precisión: HIGHEST (GPS real)');
    console.log('🔄 Deberías ver "🔄 Task ejecutada" cada 30 segundos');
    console.log('📝 Verás las coordenadas en la consola cada vez que se capturen');
    console.log('================================');
    console.log('[BackgroundLocation] Tracking iniciado correctamente');
    await AsyncStorage.setItem('locationTrackingActive', 'true');
    return true;

  } catch (error) {
    console.error('[BackgroundLocation] Error iniciando tracking:', error);
    return false;
  }
}

/**
 * Detiene el tracking de ubicación en segundo plano
 */
export async function stopLocationTracking(): Promise<void> {
  try {
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK);
    
    if (isTracking) {
      await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
      console.log('[BackgroundLocation] Tracking detenido');
    }

    await AsyncStorage.setItem('locationTrackingActive', 'false');

  } catch (error) {
    console.error('[BackgroundLocation] Error deteniendo tracking:', error);
  }
}

/**
 * Verifica si el tracking está activo
 */
export async function isLocationTrackingActive(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK);
  } catch (error) {
    console.error('[BackgroundLocation] Error verificando estado del tracking:', error);
    return false;
  }
}

/**
 * Obtiene la última ubicación registrada (para debugging)
 */
export async function getLastLocationUpdate(): Promise<(LocationUpdate & { sentAt: string }) | null> {
  try {
    const lastUpdate = await AsyncStorage.getItem('lastLocationUpdate');
    return lastUpdate ? JSON.parse(lastUpdate) : null;
  } catch (error) {
    console.error('[BackgroundLocation] Error obteniendo última ubicación:', error);
    return null;
  }
}
