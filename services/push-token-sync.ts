import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { logError } from './logger';

const API_BASE_URL = 'https://gargano-proxy.vercel.app/api/proxy?endpoint=';
const TOKEN_SYNC_INTERVAL = 24 * 60 * 60 * 1000; // 24 horas en milisegundos
const LAST_SYNC_KEY = '@gargano/last_token_sync';

let syncIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Verifica y actualiza el token push si es necesario
 */
async function syncPushToken(silent: boolean = true): Promise<void> {
  try {
    // 1. Verificar que sea dispositivo físico
    if (!Device.isDevice) {
      console.log('[PushTokenSync] Saltando sync - no es dispositivo físico');
      return;
    }

    // 2. Obtener usuario actual
    const usuario = await AsyncStorage.getItem('nombre_usuario');
    if (!usuario) {
      console.log('[PushTokenSync] Saltando sync - usuario no autenticado');
      return;
    }

    console.log('[PushTokenSync] 🔄 Iniciando verificación de token para:', usuario);

    // 3. Verificar permisos
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      console.log('[PushTokenSync] Saltando sync - permisos no otorgados');
      return;
    }

    // 4. Obtener token actual del dispositivo
    const tokenActual = await Notifications.getExpoPushTokenAsync({
      projectId: 'fb941144-6082-4e3b-9fbf-7b3aeaa7149a',
    });

    // 5. Verificar token en BD
    const verificarResponse = await fetch(
      `${API_BASE_URL}verificar_token_notificacion/${encodeURIComponent(usuario)}`,
      { method: 'GET' }
    );

    if (verificarResponse.status === 404) {
      // No tiene token en BD, guardar el actual
      console.log('[PushTokenSync] No hay token en BD, guardando...');
      await guardarToken(usuario, tokenActual.data, silent);
      return;
    }

    const verificarData = await verificarResponse.json();
    const tokenEnBD = verificarData.token;

    // 6. Comparar tokens
    if (tokenActual.data !== tokenEnBD) {
      console.log('[PushTokenSync] ⚠️ Token desactualizado detectado');
      console.log('[PushTokenSync] Token BD:', tokenEnBD);
      console.log('[PushTokenSync] Token actual:', tokenActual.data);
      await guardarToken(usuario, tokenActual.data, silent);
    } else {
      console.log('[PushTokenSync] ✅ Token vigente y actualizado');
    }

    // 7. Guardar timestamp de última sincronización
    await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());

  } catch (error) {
    console.error('[PushTokenSync] ❌ Error en sincronización:', error);
    await logError('PushTokenSync', 'syncPushToken', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Guarda o actualiza el token en el backend
 */
async function guardarToken(usuario: string, token: string, silent: boolean): Promise<void> {
  try {
    const response = await fetch(
      `${API_BASE_URL}guardar_token_notificacion`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario: usuario,
          token_notificacion: token,
        }),
      }
    );

    const data = await response.json();

    if (data.success) {
      console.log('[PushTokenSync] ✅ Token actualizado exitosamente');
      if (!silent) {
        console.log('[PushTokenSync] Token guardado:', token);
      }
    } else {
      console.error('[PushTokenSync] ❌ Error guardando token:', data);
      await logError('PushTokenSync', 'guardar_token_notificacion', {
        error: JSON.stringify(data),
        usuario,
      });
    }
  } catch (error) {
    console.error('[PushTokenSync] ❌ Error guardando token:', error);
    await logError('PushTokenSync', 'guardar_token_notificacion', {
      error: error instanceof Error ? error.message : String(error),
      usuario,
    });
  }
}

/**
 * Inicia el servicio de sincronización automática
 */
export async function startPushTokenSync(): Promise<void> {
  console.log('[PushTokenSync] 🚀 Iniciando servicio de sincronización automática');
  
  // Verificar si es necesario sincronizar inmediatamente
  try {
    const lastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);
    const now = new Date().getTime();
    
    if (!lastSync) {
      // Primera vez, sincronizar inmediatamente
      console.log('[PushTokenSync] Primera sincronización');
      await syncPushToken(true);
    } else {
      const lastSyncTime = new Date(lastSync).getTime();
      const timeSinceLastSync = now - lastSyncTime;
      
      if (timeSinceLastSync >= TOKEN_SYNC_INTERVAL) {
        // Han pasado más de 24 horas, sincronizar
        console.log('[PushTokenSync] Han pasado 24+ horas, sincronizando...');
        await syncPushToken(true);
      } else {
        const hoursRemaining = Math.floor((TOKEN_SYNC_INTERVAL - timeSinceLastSync) / (1000 * 60 * 60));
        console.log(`[PushTokenSync] Próxima sincronización en ~${hoursRemaining} horas`);
      }
    }
  } catch (error) {
    console.error('[PushTokenSync] Error verificando última sincronización:', error);
    // En caso de error, sincronizar de todas formas
    await syncPushToken(true);
  }

  // Detener intervalo anterior si existe
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
  }

  // Configurar sincronización periódica cada 24 horas
  syncIntervalId = setInterval(async () => {
    console.log('[PushTokenSync] ⏰ Ejecutando sincronización periódica (24h)');
    await syncPushToken(true);
  }, TOKEN_SYNC_INTERVAL);

  console.log('[PushTokenSync] ✅ Servicio iniciado - sincronización cada 24 horas');
}

/**
 * Detiene el servicio de sincronización automática
 */
export function stopPushTokenSync(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
    console.log('[PushTokenSync] 🛑 Servicio de sincronización detenido');
  }
}

/**
 * Fuerza una sincronización manual inmediata
 */
export async function forcePushTokenSync(): Promise<void> {
  console.log('[PushTokenSync] 🔧 Sincronización manual forzada');
  await syncPushToken(false);
}
