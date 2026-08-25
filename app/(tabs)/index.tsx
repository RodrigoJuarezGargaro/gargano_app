import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { saveAuthToken } from '@/services/auth-token';
import {
  authenticateWithBiometrics,
  enableBiometricLogin,
  getBiometricPromptMessage,
  getBiometricTypeLabel,
  isBiometricHardwareAvailable,
  isBiometricLoginEnabled,
} from '@/services/biometric-auth';
import { logError, logLogin, logLogout } from '@/services/logger';
import { forcePushTokenSync } from '@/services/push-token-sync';
import { isServerDown } from '@/services/server-health';
import {
  clearUserSession,
  getStoredLoginUsername,
  hasPersistedLogin,
  saveUserSessionFromResponse,
} from '@/services/session-storage';

const API_BASE_URL = 'https://www.gargano.com.ar/laravel_backend_app/public/api/';


export default function HomeScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isAuthenticatingBiometric, setIsAuthenticatingBiometric] = useState(false);
  const [showBiometricButton, setShowBiometricButton] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('huella dactilar');
  const [showServerDownModal, setShowServerDownModal] = useState(false);

  const navigateToHome = () => {
    router.replace('/hoja_ruta');
  };

  const persistLoginData = async (responseData: { token?: string; user: Record<string, unknown> }, loginEmail: string) => {
    if (responseData.token) {
      await saveAuthToken(responseData.token);
      console.log('[Login] Token de autenticación guardado');
    } else {
      console.warn('[Login] Respuesta exitosa pero sin token');
    }

    await saveUserSessionFromResponse(responseData, loginEmail);
    await AsyncStorage.setItem('id_perfil', String(responseData.user.id_perfil));
    await AsyncStorage.setItem('nombre_perfil', String(responseData.user.perfil_nombre));
    await AsyncStorage.setItem('nombre_usuario', String(responseData.user.nombre_usuario));
    await AsyncStorage.setItem('userSession', JSON.stringify(responseData.user));

    await logLogin(loginEmail);

    forcePushTokenSync().catch((err: unknown) =>
      console.warn('[Login] Error sincronizando token push:', err),
    );
  };

  const offerBiometricActivation = async () => {
    const hardwareAvailable = await isBiometricHardwareAvailable();
    const alreadyEnabled = await isBiometricLoginEnabled();

    if (!hardwareAvailable || alreadyEnabled) {
      navigateToHome();
      return;
    }

    const label = await getBiometricTypeLabel();
    const formattedLabel = `${label.charAt(0).toUpperCase()}${label.slice(1)}`;

    const activateBiometrics = async () => {
      try {
        const result = await enableBiometricLogin();

        if (result.enabled) {
          Alert.alert(
            `${formattedLabel} activada`,
            result.message,
            [{ text: 'Continuar', onPress: navigateToHome }],
            { cancelable: false },
          );
          return;
        }

        Alert.alert(
          'No se pudo activar',
          result.message,
          [
            { text: `Continuar sin ${label}`, onPress: navigateToHome },
            { text: 'Reintentar', onPress: () => void activateBiometrics() },
          ],
          { cancelable: false },
        );
      } catch (error) {
        console.error('[Login] Error inesperado activando biometría:', error);
        Alert.alert(
          'No se pudo activar',
          'Ocurrió un error inesperado. Podés continuar usando la app e intentarlo nuevamente en otro momento.',
          [{ text: 'Continuar', onPress: navigateToHome }],
          { cancelable: false },
        );
      }
    };

    Alert.alert(
      'Acceso rápido',
      `¿Quieres usar ${label} para ingresar la próxima vez?`,
      [
        {
          text: 'Ahora no',
          style: 'cancel',
          onPress: navigateToHome,
        },
        {
          text: 'Activar',
          onPress: () => void activateBiometrics(),
        },
      ],
      { cancelable: false },
    );
  };

  const handleBiometricLogin = async () => {
    setIsAuthenticatingBiometric(true);
    try {
      const success = await authenticateWithBiometrics(await getBiometricPromptMessage('login'));
      if (success) {
        navigateToHome();
        return;
      }

      Toast.show({ type: 'info', text1: 'Ingresa con tu usuario y contraseña' });
    } finally {
      setIsAuthenticatingBiometric(false);
    }
  };

  useEffect(() => {
    console.log('Verificando sesion de usuario...');
    const checkSession = async () => {
      const hardwareAvailable = await isBiometricHardwareAvailable();
      const biometricEnabled = await isBiometricLoginEnabled();
      const label = await getBiometricTypeLabel();
      setBiometricLabel(label);
      setShowBiometricButton(hardwareAvailable && biometricEnabled);

      const storedUsername = await getStoredLoginUsername();
      if (storedUsername) {
        setEmail(storedUsername);
      }

      const hasLogin = await hasPersistedLogin();
      if (hasLogin) {
        if (biometricEnabled && hardwareAvailable) {
          const success = await authenticateWithBiometrics(await getBiometricPromptMessage('login'));
          if (success) {
            navigateToHome();
            return;
          }

          setIsCheckingSession(false);
          return;
        }

        navigateToHome();
        return;
      }

      const onboardingDone = await AsyncStorage.getItem('onboarding_completed');
      if (!onboardingDone) {
        router.replace('/onboarding');
        return;
      }

      setIsCheckingSession(false);
    };

    checkSession();
  }, [router]);

  const handleLogin = async () => {
    console.log('Intentando login con token...');
    console.log('URL API:', API_BASE_URL + 'login_token');
    setIsLoggingIn(true);
    try {
      const response = await fetch(API_BASE_URL + 'login_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ login: String(email).trim(), clave: String(password) }),
      });

      const responseData = await response.json();

      if (!response.ok || !responseData.success) {
        const errorMessage = responseData?.message || `Error de login: ${response.status} ${response.statusText}`;
        Toast.show({ type: 'error', text1: errorMessage });
        console.error('Login failed:', errorMessage, responseData);
        return;
      }

      // Guardar token y sesión — fuera del bloque de red para no confundir errores
      try {
        await persistLoginData(responseData, String(email).trim());
      } catch (saveError) {
        console.error('[Login] Error guardando sesión post-login:', saveError);
      }
      await offerBiometricActivation();
    } catch (error) {
      console.error('Error de red en la API:', error);
      
      // Log del error
      await logError('Login', 'login_token', {
        error: error instanceof Error ? error.message : String(error),
        email: email,
      });
      
      // Verificar si el servidor está caído
      const serverIsDown = await isServerDown();
      
      if (serverIsDown) {
        // Mostrar modal de servidor caído
        setShowServerDownModal(true);
      } else {
        // Error de conexión del usuario
        Toast.show({ type: 'error', text1: 'No se pudo conectar con el servidor. Verifica tu conexion a internet.' });
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleClearSession = async () => {
    await logLogout('manualmente desde pantalla de carga');
    await clearUserSession();
    setEmail('');
    setPassword('');
  };


  if (isCheckingSession) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#926FA9" />
          <Text style={styles.loadingText}>Cargando sesion...</Text>
          <Pressable onPress={handleClearSession} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>Limpiar sesion</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardWrapper}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.brandBlock}>
            <Image
              source={require('@/assets/images/favicon.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <View>
              <Text style={styles.brandTitle}>Gargano Logistica</Text>
              <Text style={styles.brandSubtitle}>
                Formados durante 30 anos en el area del transporte de cargas y logistica
              </Text>
            </View>
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.title}>Iniciar sesion</Text>
            <Text style={styles.subtitle}>Completa el formulario para iniciar sesion</Text>

            <View style={styles.dividersRow}>
              <View style={styles.divider} />
              <View style={styles.divider} />
            </View>

            <Text style={styles.label}>Nombre de usuario</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="username"
              keyboardType="default"
              onChangeText={setEmail}
              placeholder="Nombre de usuario"
              placeholderTextColor="#91A0BF"
              style={styles.input}
              value={email}
            />

            <Text style={styles.label}>Contraseña</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                onChangeText={setPassword}
                placeholder="Contraseña"
                placeholderTextColor="#91A0BF"
                secureTextEntry={secureTextEntry}
                style={styles.passwordInput}
                value={password}
              />
              <Pressable
                accessibilityLabel={secureTextEntry ? 'Mostrar contrasena' : 'Ocultar contrasena'}
                hitSlop={10}
                onPress={() => setSecureTextEntry((current) => !current)}
                style={styles.eyeButton}>
                <Ionicons name={secureTextEntry ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6D7484" />
              </Pressable>
            </View>

            <Pressable onPress={handleLogin} disabled={isLoggingIn} style={[styles.loginButton, isLoggingIn && styles.loginButtonDisabled]}>
              {isLoggingIn
                ? <ActivityIndicator 
                    size="small" 
                    color="#F6F1FB" />
                : <Text 
                    style={styles.loginButtonText}>
                      Iniciar sesion
                  </Text>
              }
            </Pressable>

            {showBiometricButton ? (
              <>
                <View style={styles.biometricDividerRow}>
                  <View style={styles.divider} />
                  <Text style={styles.biometricDividerText}>o</Text>
                  <View style={styles.divider} />
                </View>

                <Pressable
                  onPress={handleBiometricLogin}
                  disabled={isAuthenticatingBiometric}
                  style={[styles.biometricButton, isAuthenticatingBiometric && styles.loginButtonDisabled]}>
                  {isAuthenticatingBiometric ? (
                    <ActivityIndicator size="small" color="#926FA9" />
                  ) : (
                    <>
                      <Ionicons
                        name={biometricLabel.includes('Face') ? 'scan-outline' : 'finger-print-outline'}
                        size={22}
                        color="#926FA9"
                      />
                      <Text style={styles.biometricButtonText}>
                        Ingresar con {biometricLabel}
                      </Text>
                    </>
                  )}
                </Pressable>
              </>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal de Servidor Caído */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showServerDownModal}
        onRequestClose={() => setShowServerDownModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Ionicons name="alert-circle" size={48} color="#F44336" />
              <Text style={styles.modalTitle}>Servidor No Disponible</Text>
            </View>
            
            <View style={styles.modalBody}>
              <Text style={styles.modalMessage}>
                El servidor o la API no está disponible en este momento. Esto puede deberse a:
              </Text>
              
              <View style={styles.modalReasonsList}>
                <View style={styles.modalReasonItem}>
                  <Ionicons name="ellipse" size={8} color="#A3ADBF" style={styles.bulletPoint} />
                  <Text style={styles.modalReasonText}>Mantenimiento programado</Text>
                </View>
                <View style={styles.modalReasonItem}>
                  <Ionicons name="ellipse" size={8} color="#A3ADBF" style={styles.bulletPoint} />
                  <Text style={styles.modalReasonText}>Problemas técnicos temporales</Text>
                </View>
                <View style={styles.modalReasonItem}>
                  <Ionicons name="ellipse" size={8} color="#A3ADBF" style={styles.bulletPoint} />
                  <Text style={styles.modalReasonText}>Actualización del sistema</Text>
                </View>
              </View>
              
              <Text style={styles.modalFooterText}>
                Por favor, intenta nuevamente en unos minutos. No es necesario contactar a sistemas.
              </Text>
            </View>
            
            <Pressable 
              onPress={() => setShowServerDownModal(false)}
              style={styles.modalCloseButton}>
              <Text style={styles.modalCloseButtonText}>Entendido</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#06080D',
    borderWidth: 4,
    borderColor: '#5A414E',
  },
  keyboardWrapper: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#B7C2D8',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 26,
    justifyContent: 'center',
  },
  brandBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 54,
  },
  logoImage: {
    width: 60,
    height: 60,
    borderRadius: 10,
  },
  brandTitle: {
    color: '#E8ECF7',
    fontSize: 23,
    fontWeight: '700',
    marginBottom: 2,
  },
  brandSubtitle: {
    maxWidth: 220,
    color: '#9AA3B6',
    fontSize: 12,
    lineHeight: 17,
  },
  formBlock: {
    marginTop: 0,
  },
  title: {
    color: '#E5E9F5',
    fontSize: 34,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    color: '#A3ADBF',
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 24,
  },
  dividersRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#343A46',
  },
  label: {
    color: '#B3BCCE',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    width: '100%',
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#44506A',
    backgroundColor: '#232E44',
    color: '#F2F5FB',
    fontSize: 18,
    fontWeight: '600',
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  passwordContainer: {
    width: '100%',
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#44506A',
    backgroundColor: '#232E44',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  passwordInput: {
    flex: 1,
    color: '#F2F5FB',
    fontSize: 18,
    fontWeight: '600',
    paddingHorizontal: 12,
  },
  eyeButton: {
    paddingHorizontal: 10,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButton: {
    height: 50,
    borderRadius: 8,
    backgroundColor: '#926FA9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#F6F1FB',
    fontSize: 24,
    fontWeight: '700',
  },
  biometricDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    marginBottom: 20,
  },
  biometricDividerText: {
    color: '#A3ADBF',
    fontSize: 14,
    fontWeight: '600',
  },
  biometricButton: {
    height: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#926FA9',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  biometricButtonText: {
    color: '#D8C4E6',
    fontSize: 16,
    fontWeight: '700',
  },
  clearButton: {
    height: 44,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#7A5E7A',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingHorizontal: 16,
  },
  clearButtonText: {
    color: '#B7C2D8',
    fontSize: 14,
    fontWeight: '600',
  },
  // Estilos del Modal de Servidor Caído
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(6, 8, 13, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#0F1419',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#F44336',
    padding: 24,
    shadowColor: '#F44336',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#F44336',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'center',
  },
  modalBody: {
    marginBottom: 24,
  },
  modalMessage: {
    color: '#E8ECF7',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalReasonsList: {
    backgroundColor: '#1A1F28',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  modalReasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bulletPoint: {
    marginRight: 10,
  },
  modalReasonText: {
    color: '#B3BCCE',
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  modalFooterText: {
    color: '#9AA3B6',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  modalCloseButton: {
    height: 48,
    borderRadius: 10,
    backgroundColor: '#926FA9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseButtonText: {
    color: '#F6F1FB',
    fontSize: 16,
    fontWeight: '700',
  },
});
