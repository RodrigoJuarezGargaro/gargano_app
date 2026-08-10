import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearAuthToken, hasAuthToken } from './auth-token';
import { disableBiometricLogin } from './biometric-auth';

export type UserSession = {
  login: string;
  nombre: string;
  mail: string;
};

const SESSION_KEY = '@gargano/session';
const USER_SESSION_KEY = 'userSession';
const SESSION_KEYS = [
  SESSION_KEY,
  USER_SESSION_KEY,
  'id_perfil',
  'nombre_perfil',
  'nombre_usuario',
] as const;

let inMemorySession: UserSession | null = null;
let didWarnStorageError = false;

const sanitizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const sanitizeSession = (session: Partial<UserSession>): UserSession => ({
  login: sanitizeText(session.login),
  nombre: sanitizeText(session.nombre),
  mail: sanitizeText(session.mail),
});

const warnStorageIssueOnce = (message: string, error: unknown) => {
  if (didWarnStorageError) {
    return;
  }

  didWarnStorageError = true;
  console.warn(message, error);
};

export async function saveUserSessionFromResponse(responseData: unknown, fallbackEmail: string) {
  const root = typeof responseData === 'object' && responseData !== null ? responseData : {};
  const nestedUser =
    'user' in root && typeof (root as { user?: unknown }).user === 'object' && (root as { user?: unknown }).user !== null
      ? ((root as { user?: unknown }).user as Record<string, unknown>)
      : null;

  const source = nestedUser ?? (root as Record<string, unknown>);

  const session: UserSession = {
    login: sanitizeText(source.login) || sanitizeText(fallbackEmail),
    nombre: sanitizeText(source.nombre_usuario) || sanitizeText(source.nombre),
    mail: sanitizeText(source.mail) || sanitizeText(fallbackEmail),
  };

  inMemorySession = session;

  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (error) {
    warnStorageIssueOnce('No se pudo guardar sesión en storage. Se usara sesion en memoria:', error);
  }

  return session;
}

export async function getUserSession() {
  try {
    const stored = await AsyncStorage.getItem(SESSION_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<UserSession>;
      const session = sanitizeSession(parsed);
      inMemorySession = session;
      return session;
    }

    const legacySession = await AsyncStorage.getItem(USER_SESSION_KEY);
    if (legacySession) {
      const parsed = JSON.parse(legacySession) as Record<string, unknown>;
      const session = sanitizeSession({
        login: parsed.login,
        nombre: parsed.nombre_usuario ?? parsed.nombre,
        mail: parsed.mail,
      });
      inMemorySession = session;
      return session;
    }

    return inMemorySession;
  } catch (error) {
    warnStorageIssueOnce('Error leyendo sesión del storage. Se usara sesion en memoria:', error);
    return inMemorySession;
  }
}

export async function hasPersistedLogin(): Promise<boolean> {
  const tokenExists = await hasAuthToken();
  if (!tokenExists) {
    return false;
  }

  const userSession = await AsyncStorage.getItem(USER_SESSION_KEY);
  const typedSession = await AsyncStorage.getItem(SESSION_KEY);
  return Boolean(userSession || typedSession);
}

export async function getStoredLoginUsername(): Promise<string | null> {
  const session = await getUserSession();
  if (session?.login) {
    return session.login;
  }

  return null;
}

export async function clearUserSession() {
  inMemorySession = null;

  try {
    await AsyncStorage.multiRemove([...SESSION_KEYS]);
    await clearAuthToken();
    await disableBiometricLogin();
  } catch (error) {
    warnStorageIssueOnce('No se pudo limpiar sesión del storage:', error);
  }
}

export async function logoutUser(clearAllStorage = false): Promise<void> {
  await clearUserSession();

  if (clearAllStorage) {
    try {
      await AsyncStorage.clear();
    } catch (error) {
      warnStorageIssueOnce('No se pudo limpiar todo el storage:', error);
    }
  }
}
