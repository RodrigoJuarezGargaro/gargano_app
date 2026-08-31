import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

const API_BASE_URL = 'https://www.gargano.com.ar/laravel_backend_app/public/api/';
const APP_VERSION = require('../app.config.js').version;

type LogType = 'login' | 'logout' | 'error' | 'info' | 'warning' | 'accion';

interface LogParams {
  tipo: LogType;
  pantalla: string;
  detalles?: string;
  username?: string | null;
}

/**
 * Obtiene o genera un ID de sesión único para el dispositivo
 */
async function getSessionId(): Promise<string> {
  try {
    let sessionId = await AsyncStorage.getItem('app_session_id');
    if (!sessionId) {
      sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      await AsyncStorage.setItem('app_session_id', sessionId);
    }
    return sessionId;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
}

/**
 * Obtiene el ID del usuario actual
 */
async function getUserId(): Promise<number | null> {
  try {
    const idPerfil = await AsyncStorage.getItem('id_perfil');
    return idPerfil ? parseInt(idPerfil, 10) : null;
  } catch {
    return null;
  }
}

/**
 * Obtiene el login del usuario actual (mismo valor que en el login, ej. rjuarez).
 */
async function getUsername(explicit?: string | null): Promise<string | null> {
  const fromParam = typeof explicit === 'string' ? explicit.trim() : '';
  if (fromParam) {
    return fromParam;
  }

  try {
    const typedSessionRaw = await AsyncStorage.getItem('@gargano/session');
    if (typedSessionRaw) {
      const typedSession = JSON.parse(typedSessionRaw) as Record<string, unknown>;
      const login = String(typedSession.login ?? '').trim();
      if (login) {
        return login;
      }
    }

    const sessionRaw = await AsyncStorage.getItem('userSession');
    if (sessionRaw) {
      const session = JSON.parse(sessionRaw) as Record<string, unknown>;
      const login = String(session.login ?? '').trim();
      if (login) {
        return login;
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Obtiene información del dispositivo
 */
function getDeviceId(): string {
  try {
    const deviceInfo = [
      Device.modelName || 'Unknown',
      Device.brand || 'Unknown',
      Device.osName || Platform.OS,
      Device.osVersion || 'Unknown',
    ].join('_');
    return deviceInfo.replace(/\s+/g, '_');
  } catch {
    return `${Platform.OS}_unknown`;
  }
}

/**
 * Obtiene la plataforma actual
 */
function getPlatform(): string {
  return Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web';
}

/**
 * Envía un log al backend
 */
export async function logEvent(params: LogParams): Promise<void> {
  try {
    const userId = await getUserId();
    const username = await getUsername(params.username);
    const sessionId = await getSessionId();
    const deviceId = getDeviceId();
    const platform = getPlatform();
    const version = '1.1.0';
    console.log('version', version);
    
    const logData = {
      id_user: userId,
      username,
      id_dispositivo: deviceId,
      id_session: sessionId,
      tipo: params.tipo,
      pantalla: params.pantalla,
      plataforma: platform,
      version_app: version,
      detalles: params.detalles || null,
    };
    console.log('[Logger] Enviando log:', params.tipo, params.pantalla, username);

    // NOTA: El logger NO usa autenticación porque necesitamos logs
    // incluso cuando no hay sesión activa (errores de login, etc.)
    const response = await fetch(`${API_BASE_URL}guardar_log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(logData),
    });

    if (!response.ok) {
      console.warn('[Logger] Error al guardar log:', response.status);
    }
  } catch (error) {
    // No lanzar error para evitar que el logging afecte la funcionalidad principal
    console.warn('[Logger] Error enviando log:', error);
  }
}

/**
 * Log de inicio de sesión exitoso
 */
export async function logLogin(email: string): Promise<void> {
  await logEvent({
    tipo: 'login',
    pantalla: 'Login',
    username: email,
    detalles: `Usuario ${email} inició sesión correctamente`,
  });
}

/**
 * Log de cierre de sesión
 */
export async function logLogout(origen?: string): Promise<void> {
  const userId = await getUserId();
  const username = await getUsername();
  const quien = username || (userId !== null ? `ID ${userId}` : 'desconocido');
  const donde = origen?.trim() ? ` ${origen.trim()}` : '';
  await logEvent({
    tipo: 'logout',
    pantalla: 'Session',
    username,
    detalles: `Usuario ${quien} cerró sesión${donde}`,
  });
}

/**
 * Log de error en un endpoint
 */
export async function logError(pantalla: string, endpoint: string, errorData: any): Promise<void> {
  let detalles = `Error en endpoint: ${endpoint}`;
  
  try {
    if (typeof errorData === 'object') {
      detalles += `\nDetalles: ${JSON.stringify(errorData, null, 2)}`;
    } else {
      detalles += `\nDetalles: ${String(errorData)}`;
    }
  } catch {
    detalles += `\nDetalles: [Error no serializable]`;
  }

  await logEvent({
    tipo: 'error',
    pantalla,
    detalles: detalles.substring(0, 5000), // Limitar longitud
  });
}

/**
 * Log de error genérico con mensaje personalizado
 */
export async function logCustomError(pantalla: string, mensaje: string): Promise<void> {
  await logEvent({
    tipo: 'error',
    pantalla,
    detalles: mensaje,
  });
}

/**
 * Log de información general
 */
export async function logInfo(pantalla: string, mensaje: string): Promise<void> {
  await logEvent({
    tipo: 'info',
    pantalla,
    detalles: mensaje,
  });
}

/**
 * Log de acciones de entrega (confirmación, rechazo, parcial, etc.)
 */
export async function logAccion(
  accion: 'confirmacion' | 'rechazo' | 'parcial' | 'anular' | 'health' | 'filtro' | 'imagen',
  detalles: Record<string, unknown>,
  pantalla = 'NuevaHojaRuta',
): Promise<void> {
  await logEvent({
    tipo: 'accion',
    pantalla,
    detalles: JSON.stringify({ accion, ...detalles }).substring(0, 5000),
  });
}
