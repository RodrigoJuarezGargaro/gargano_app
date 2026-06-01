/**
 * Servicio de gestión de tokens de autenticación
 * Maneja el almacenamiento y uso de tokens de Laravel Sanctum
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_TOKEN_KEY = '@gargano/auth_token';

/**
 * Guarda el token de autenticación en AsyncStorage
 * @param token - Token de autenticación recibido del backend
 */
export async function saveAuthToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
    console.log('[AuthToken] Token guardado exitosamente');
  } catch (error) {
    console.error('[AuthToken] Error guardando token:', error);
    throw error;
  }
}

/**
 * Obtiene el token de autenticación almacenado
 * @returns Token de autenticación o null si no existe
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    return token;
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
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    console.log('[AuthToken] Token eliminado exitosamente');
  } catch (error) {
    console.error('[AuthToken] Error eliminando token:', error);
    throw error;
  }
}

/**
 * Verifica si existe un token de autenticación válido
 * @returns true si existe un token, false si no
 */
export async function hasAuthToken(): Promise<boolean> {
  const token = await getAuthToken();
  return token !== null && token.length > 0;
}

/**
 * Crea headers de autenticación para peticiones fetch
 * Incluye el token Bearer y headers comunes
 * @param additionalHeaders - Headers adicionales opcionales
 * @returns Headers configurados con autenticación
 */
export async function getAuthHeaders(additionalHeaders?: Record<string, string>): Promise<HeadersInit> {
  const token = await getAuthToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...additionalHeaders,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Realiza una petición fetch autenticada con el token
 * @param endpoint - Endpoint a consultar (sin el prefijo del proxy)
 * @param options - Opciones de fetch (method, body, etc.)
 * @returns Response de la petición
 */
export async function authenticatedFetch(
  endpoint: string, 
  options: RequestInit = {}
): Promise<Response> {
  const API_BASE_URL = 'https://gargano-proxy.vercel.app/api/proxy?endpoint=';
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
