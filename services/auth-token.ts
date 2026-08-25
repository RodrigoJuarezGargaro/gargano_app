/**
 * Servicio de gestión de tokens de autenticación
 * Maneja el almacenamiento y uso de tokens de Laravel Sanctum
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// SecureStore solo admite alfanuméricos, ".", "-" y "_"
const AUTH_TOKEN_KEY = 'gargano_auth_token';
const LEGACY_AUTH_TOKEN_KEYS = ['@gargano/auth_token', 'gargano_auth_token'] as const;

async function readTokenFromSecureStore(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(AUTH_TOKEN_KEY);
  }

  try {
    return await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  } catch (error) {
    console.warn('[AuthToken] Error leyendo token de SecureStore:', error);
    return null;
  }
}

async function writeTokenToSecureStore(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
    return;
  }

  try {
    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
  } catch (error) {
    console.warn('[AuthToken] SecureStore no disponible, usando AsyncStorage como fallback:', error);
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
  }
}

async function deleteTokenFromSecureStore(): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    return;
  }

  try {
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
  } catch (error) {
    console.warn('[AuthToken] Error eliminando token de SecureStore:', error);
  }
}

async function migrateLegacyTokenIfNeeded(): Promise<string | null> {
  const secureToken = await readTokenFromSecureStore();
  if (secureToken) {
    return secureToken;
  }

  try {
    for (const legacyKey of LEGACY_AUTH_TOKEN_KEYS) {
      const legacyToken = await AsyncStorage.getItem(legacyKey);
      if (!legacyToken) {
        continue;
      }

      await writeTokenToSecureStore(legacyToken);
      await AsyncStorage.multiRemove([...LEGACY_AUTH_TOKEN_KEYS]);
      return legacyToken;
    }

    return null;
  } catch (error) {
    console.warn('[AuthToken] Error migrando token legacy:', error);
    return null;
  }
}

/**
 * Guarda el token de autenticación en almacenamiento seguro
 */
export async function saveAuthToken(token: string): Promise<void> {
  try {
    await writeTokenToSecureStore(token);
    console.log('[AuthToken] Token guardado exitosamente');
  } catch (error) {
    console.error('[AuthToken] Error guardando token, usando fallback AsyncStorage:', error);
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
  }
}

/**
 * Obtiene el token de autenticación almacenado
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    return await migrateLegacyTokenIfNeeded();
  } catch (error) {
    console.error('[AuthToken] Error obteniendo token:', error);
    return null;
  }
}

/**
 * Elimina el token de autenticación (útil en logout)
 */
export async function clearAuthToken(): Promise<void> {
  try {
    await deleteTokenFromSecureStore();
    await AsyncStorage.multiRemove([...LEGACY_AUTH_TOKEN_KEYS]);
    console.log('[AuthToken] Token eliminado exitosamente');
  } catch (error) {
    console.error('[AuthToken] Error eliminando token:', error);
    throw error;
  }
}

/**
 * Verifica si existe un token de autenticación válido
 */
export async function hasAuthToken(): Promise<boolean> {
  const token = await getAuthToken();
  return token !== null && token.length > 0;
}

/**
 * Crea headers de autenticación para peticiones fetch
 */
export async function getAuthHeaders(additionalHeaders?: Record<string, string>): Promise<HeadersInit> {
  const token = await getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...additionalHeaders,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Realiza una petición fetch autenticada con el token
 */
export async function authenticatedFetch(
  endpoint: string,
  options: RequestInit = {},
): Promise<Response> {
  const API_BASE_URL = 'https://www.gargano.com.ar/laravel_backend_app/public/api/';
  const authHeaders = await getAuthHeaders();

  const response = await fetch(API_BASE_URL + endpoint, {
    ...options,
    headers: {
      ...authHeaders,
      ...(options.headers || {}),
    },
  });

  return response;
}
