import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// SecureStore solo admite alfanuméricos, ".", "-" y "_"
const BIOMETRIC_ENABLED_KEY = 'gargano_biometric_enabled';
const LEGACY_BIOMETRIC_ENABLED_KEY = '@gargano/biometric_enabled';

export type BiometricActivationResult = {
  enabled: boolean;
  message: string;
};

export async function isBiometricHardwareAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled;
  } catch (error) {
    console.warn('[BiometricAuth] Error verificando hardware:', error);
    return false;
  }
}

export async function getBiometricTypeLabel(): Promise<string> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const hasFingerprint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
    const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    const hasIris = types.includes(LocalAuthentication.AuthenticationType.IRIS);

    // iOS: Face ID / Touch ID
    if (Platform.OS === 'ios') {
      if (hasFace) {
        return 'Face ID';
      }
      if (hasFingerprint) {
        return 'Touch ID';
      }
      if (hasIris) {
        return 'reconocimiento de iris';
      }
      return 'Face ID';
    }

    // Android: priorizar huella (no existe Face ID)
    if (hasFingerprint) {
      return 'huella dactilar';
    }
    if (hasFace) {
      return 'reconocimiento facial';
    }
    if (hasIris) {
      return 'reconocimiento de iris';
    }
  } catch (error) {
    console.warn('[BiometricAuth] Error obteniendo tipo biométrico:', error);
  }

  return Platform.OS === 'ios' ? 'Face ID' : 'huella dactilar';
}

/** Mensaje del diálogo biométrico según plataforma y uso. */
export async function getBiometricPromptMessage(purpose: 'login' | 'activate' = 'login'): Promise<string> {
  const label = await getBiometricTypeLabel();

  if (Platform.OS === 'ios') {
    return purpose === 'activate'
      ? `Confirmá tu identidad con ${label} para activar el acceso rápido`
      : `Ingresá a Gargano Logística con ${label}`;
  }

  // Android
  return purpose === 'activate'
    ? 'Confirmá tu huella dactilar para activar el acceso rápido en Gargano Logística'
    : 'Ingresá a Gargano Logística con tu huella dactilar';
}

async function readBiometricFlag(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
  }

  try {
    const value = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
    if (value !== null) {
      return value;
    }
  } catch (error) {
    console.warn('[BiometricAuth] Error leyendo SecureStore:', error);
  }

  try {
    return await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
  } catch (error) {
    console.warn('[BiometricAuth] Error leyendo AsyncStorage:', error);
    return null;
  }
}

async function writeBiometricFlag(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, value);
    return;
  }

  try {
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, value);
    await AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY).catch(() => undefined);
    await AsyncStorage.removeItem(LEGACY_BIOMETRIC_ENABLED_KEY).catch(() => undefined);
    return;
  } catch (error) {
    console.warn('[BiometricAuth] SecureStore falló, usando AsyncStorage:', error);
  }

  await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, value);
}

async function deleteBiometricFlag(): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY);
    return;
  }

  try {
    await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
  } catch (error) {
    console.warn('[BiometricAuth] Error borrando SecureStore:', error);
  }

  try {
    await AsyncStorage.multiRemove([BIOMETRIC_ENABLED_KEY, LEGACY_BIOMETRIC_ENABLED_KEY]);
  } catch (error) {
    console.warn('[BiometricAuth] Error borrando AsyncStorage:', error);
  }
}

export async function isBiometricLoginEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  try {
    const value = await readBiometricFlag();
    return value === 'true';
  } catch (error) {
    console.warn('[BiometricAuth] Error leyendo flag biométrico:', error);
    return false;
  }
}

export async function enableBiometricLogin(): Promise<BiometricActivationResult> {
  const label = await getBiometricTypeLabel();
  const available = await isBiometricHardwareAvailable();
  if (!available) {
    return {
      enabled: false,
      message: Platform.OS === 'ios'
        ? `No encontramos ${label} configurado en este dispositivo.`
        : 'No encontramos una huella dactilar configurada en este dispositivo.',
    };
  }

  const authenticated = await authenticateWithBiometrics(
    await getBiometricPromptMessage('activate'),
  );

  if (!authenticated) {
    return {
      enabled: false,
      message: `No se pudo validar tu identidad. Podés reintentarlo o continuar sin ${label}.`,
    };
  }

  try {
    await writeBiometricFlag('true');
    return {
      enabled: true,
      message: `La próxima vez podrás ingresar usando ${label}.`,
    };
  } catch (error) {
    console.error('[BiometricAuth] Error guardando activación biométrica:', error);
    return {
      enabled: false,
      message: `Tu identidad fue validada, pero no pudimos guardar la activación de ${label}. Podés reintentarlo.`,
    };
  }
}

export async function disableBiometricLogin(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    await deleteBiometricFlag();
  } catch (error) {
    console.warn('[BiometricAuth] Error desactivando biometría:', error);
  }
}

export async function authenticateWithBiometrics(promptMessage?: string): Promise<boolean> {
  const available = await isBiometricHardwareAvailable();
  if (!available) {
    return false;
  }

  try {
    const resolvedPrompt = promptMessage ?? (await getBiometricPromptMessage('login'));
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: resolvedPrompt,
      cancelLabel: 'Cancelar',
      disableDeviceFallback: false,
      fallbackLabel: 'Usar contraseña',
    });

    return result.success;
  } catch (error) {
    console.warn('[BiometricAuth] Error en autenticación biométrica:', error);
    return false;
  }
}
