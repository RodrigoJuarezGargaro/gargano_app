import AsyncStorage from '@react-native-async-storage/async-storage';

export type UserSession = {
  login: string;
  nombre: string;
  mail: string;
};

const SESSION_KEY = '@gargano/session';
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
    nombre: sanitizeText(source.nombre),
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
    if (!stored) {
      return inMemorySession;
    }

    const parsed = JSON.parse(stored) as Partial<UserSession>;
    const session = sanitizeSession(parsed);
    inMemorySession = session;
    return session;
  } catch (error) {
    warnStorageIssueOnce('Error leyendo sesión del storage. Se usara sesion en memoria:', error);
    return inMemorySession;
  }
}

export async function clearUserSession() {
  inMemorySession = null;

  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch (error) {
    warnStorageIssueOnce('No se pudo limpiar sesión del storage:', error);
  }
}
