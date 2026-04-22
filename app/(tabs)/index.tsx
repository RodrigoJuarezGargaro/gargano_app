import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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

import { clearUserSession, getUserSession } from '@/services/session-storage';

// Proxy en Vercel que soluciona el problema de certificado SSL incompleto de gargano.com.ar
const API_BASE_URL = 'https://gargano-proxy.vercel.app/api/proxy?endpoint=';


export default function HomeScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const session = await getUserSession();
      if (session) {
        router.replace('/hoja_ruta');
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
    console.log('Intentando login via Proxy Vercel...');
    console.log('URL del Proxy:', API_BASE_URL + 'login');
    setIsLoggingIn(true);
    try {
      const response = await fetch(API_BASE_URL + 'login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ login: String(email).trim(), clave: String(password) }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        const errorMessage = responseData?.message || `Error de login: ${response.status} ${response.statusText}`;
        Toast.show({ type: 'error', text1: errorMessage });
        console.error('Login failed:', errorMessage, responseData);
        return;
      }

      console.log('Login exitoso:', responseData);
      await AsyncStorage.setItem('userSession', JSON.stringify(responseData.user));
      router.replace('/hoja_ruta');
    } catch (error) {
      console.error('Error de red en el Proxy:', error);
      Toast.show({ type: 'error', text1: 'No se pudo conectar con el proxy. Verifica tu conexion a internet.' });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleClearSession = async () => {
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
            <View style={styles.logoBox}>
              <Text style={styles.logoLetter}>G</Text>
            </View>
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
                // onPress={() => setSecureTextEntry((current) => !current)}
                style={styles.eyeButton}>
                <Ionicons name={secureTextEntry ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6D7484" />
              </Pressable>
            </View>

            <Pressable onPress={handleLogin} disabled={isLoggingIn} style={[styles.loginButton, isLoggingIn && styles.loginButtonDisabled]}>
              {isLoggingIn
                ? <ActivityIndicator size="small" color="#F6F1FB" />
                : <Text style={styles.loginButtonText}>Iniciar sesion</Text>
              }
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    gap: 10,
    marginBottom: 54,
  },
  logoBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#D4D7DE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: {
    color: '#171A20',
    fontSize: 26,
    fontWeight: '800',
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
});
