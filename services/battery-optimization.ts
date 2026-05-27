import { Alert, Linking, Platform } from 'react-native';

/**
 * Abre la configuración de la app
 * Solo funciona en Android
 */
export async function openBatteryOptimizationSettings(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  try {
    await Linking.openSettings();
  } catch (error) {
    console.error('No se pudo abrir configuración:', error);
    Alert.alert(
      'Error',
      'No se pudo abrir la configuración automáticamente. Por favor, ábrela manualmente:\n\nConfiguracion → Aplicaciones → Gargano Logística → Batería'
    );
  }
}

/**
 * Muestra un diálogo explicando la necesidad de desactivar optimización de batería
 * Guía al usuario a la configuración correcta
 */
export function showBatteryOptimizationAlert(marca?: string): void {
  if (Platform.OS !== 'android') {
    return;
  }

  const instrucciones = getInstruccionesPorMarca(marca);

  Alert.alert(
    '⚡ Configuración Requerida',
    `Para que el seguimiento de ubicación funcione correctamente en segundo plano, necesitas:\n\n${instrucciones}\n\n¿Quieres abrir la configuración ahora?`,
    [
      {
        text: 'Después',
        style: 'cancel',
      },
      {
        text: 'Abrir Configuración',
        onPress: openBatteryOptimizationSettings,
      },
    ]
  );
}

/**
 * Obtiene instrucciones específicas según la marca del dispositivo
 */
function getInstruccionesPorMarca(marca?: string): string {
  const marcaLower = marca?.toLowerCase() || '';

  if (marcaLower.includes('samsung')) {
    return `📱 Samsung:\n1. Batería → Sin restricciones\n2. Permitir actividad en segundo plano\n3. Bloquear app en recientes (candado)`;
  }

  if (marcaLower.includes('xiaomi') || marcaLower.includes('redmi') || marcaLower.includes('poco')) {
    return `📱 Xiaomi:\n1. Inicio automático → Activar\n2. Ahorro de batería → Sin restricciones\n3. Bloquear app en recientes (deslizar abajo)`;
  }

  if (marcaLower.includes('huawei') || marcaLower.includes('honor')) {
    return `📱 Huawei:\n1. Batería → Iniciar aplicaciones\n2. Desactivar "Administrar automáticamente"\n3. Activar las 3 opciones\n4. Bloquear en recientes`;
  }

  if (marcaLower.includes('oneplus')) {
    return `📱 OnePlus:\n1. Batería → Optimización de batería\n2. Seleccionar "No optimizar"\n3. Desactivar optimización avanzada`;
  }

  if (marcaLower.includes('motorola') || marcaLower.includes('moto')) {
    return `📱 Motorola:\n1. Batería → Optimización de batería\n2. Seleccionar "No optimizar"`;
  }

  // Instrucciones genéricas
  return `📱 Android:\n1. Configuración → Aplicaciones → Gargano Logística\n2. Batería → Sin restricciones\n3. Permitir ejecución en segundo plano`;
}

/**
 * Detecta la marca del dispositivo
 */
export function detectarMarcaDispositivo(): string {
  if (Platform.OS !== 'android') {
    return 'unknown';
  }

  // Esto requeriría expo-device o react-native-device-info
  // Por ahora retornamos 'android' genérico
  // TODO: Instalar expo-device para detectar marca exacta
  return 'android';
}

/**
 * Verifica si la app necesita mostrar el aviso de optimización de batería
 * Retorna true si es Android y es la primera vez que se activa el tracking
 */
export async function shouldShowBatteryOptimizationWarning(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }

  // Verificar si ya se mostró antes
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  const shown = await AsyncStorage.getItem('battery_warning_shown');
  
  if (shown === 'true') {
    return false;
  }

  // Marcar como mostrado
  await AsyncStorage.setItem('battery_warning_shown', 'true');
  return true;
}
