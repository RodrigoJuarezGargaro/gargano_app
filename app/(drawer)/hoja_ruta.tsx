import { authenticatedFetch } from '@/services/auth-token';
import { logError, logLogout } from '@/services/logger';
import { logoutUser } from '@/services/session-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

const API_BASE_URL = 'https://gargano-proxy.vercel.app/api/proxy?endpoint=';

export default function HojaRutaScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(true);

  useEffect(() => {
    const loadUserData = async () => {
      const nombre = await AsyncStorage.getItem('nombre_usuario');
      if (nombre) {
        setNombreUsuario(nombre);
        // Verificar y actualizar token si es necesario
        await verificarYActualizarToken(nombre);
      } else {
        setIsCheckingPermissions(false);
      }
    };
    loadUserData();
  }, []);

  const verificarYActualizarToken = async (usuario: string) => {
    try {
      // 1. Verificar si tiene token en la BD
      const verificarResponse = await authenticatedFetch(
        `verificar_token_notificacion/${encodeURIComponent(usuario)}`
      );
      
      if (verificarResponse.status === 404) {
        // No tiene token guardado
        setNotificationsEnabled(false);
        setIsCheckingPermissions(false);
        return;
      }

      const verificarData = await verificarResponse.json();
      const tokenEnBD = verificarData.token;

      if (!tokenEnBD) {
        setNotificationsEnabled(false);
        setIsCheckingPermissions(false);
        return;
      }

      // 2. El usuario tiene token en BD, verificar si sigue siendo válido
      setNotificationsEnabled(true);

      // 3. Obtener token actual del dispositivo (solo si es dispositivo físico)
      if (!Device.isDevice) {
        setIsCheckingPermissions(false);
        return;
      }

      try {
        const { status } = await Notifications.getPermissionsAsync();
        
        if (status !== 'granted') {
          // Ya no tiene permisos, desactivar notificaciones
          console.log('[TokenSync] Permisos de notificaciones revocados');
          setNotificationsEnabled(false);
          setIsCheckingPermissions(false);
          return;
        }

        // Obtener token actual
        const tokenActual = await Notifications.getExpoPushTokenAsync({
          projectId: 'fb941144-6082-4e3b-9fbf-7b3aeaa7149a',
        });

        // 4. Comparar tokens
        if (tokenActual.data !== tokenEnBD) {
          console.log('[TokenSync] Token desactualizado detectado');
          console.log('[TokenSync] Token BD:', tokenEnBD);
          console.log('[TokenSync] Token actual:', tokenActual.data);
          
          // Actualizar token en BD
          const actualizarResponse = await authenticatedFetch(
            'guardar_token_notificacion',
            {
              method: 'POST',
              body: JSON.stringify({
                usuario: usuario,
                token_notificacion: tokenActual.data,
              }),
            }
          );

          const actualizarData = await actualizarResponse.json();

          if (actualizarData.success) {
            console.log('[TokenSync] ✅ Token actualizado exitosamente');
            Toast.show({
              type: 'info',
              text1: 'Token de notificaciones actualizado',
              text2: 'Tus notificaciones siguen activas',
              position: 'bottom',
              visibilityTime: 2000,
            });
          } else {
            console.error('[TokenSync] ❌ Error actualizando token:', actualizarData);
          }
        } else {
          console.log('[TokenSync] ✅ Token vigente y actualizado');
        }
      } catch (tokenError) {
        console.log('[TokenSync] No se pudo obtener token actual (puede ser emulador):', tokenError);
        // Mantener notificaciones habilitadas si ya estaban en BD
      }
    } catch (error) {
      console.error('[TokenSync] Error verificando notificaciones:', error);
      await logError('HojaRuta', 'verificar_token_notificacion', {
        error: error instanceof Error ? error.message : String(error),
        usuario: nombreUsuario,
      });
      setNotificationsEnabled(false);
    } finally {
      setIsCheckingPermissions(false);
    }
  };

  const handleEnableNotifications = async () => {
    try {
      // 1. Validar que sea un dispositivo físico
      if (!Device.isDevice) {
        Alert.alert(
          'Notificaciones Push',
          'Las notificaciones push solo funcionan en dispositivos físicos, no en emuladores.',
          [{ text: 'Entendido' }]
        );
        return;
      }

      // 2. Solicitar permisos
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        Alert.alert(
          'Permisos Denegados',
          'No se otorgaron permisos para las notificaciones push. Por favor, habilítalos en la configuración de tu dispositivo.',
          [{ text: 'Entendido' }]
        );
        return;
      }

      // 3. Obtener el token de notificaciones de Expo
      try {
        // Obtener el Expo Push Token (formato: ExponentPushToken[XXXXXX])
        const expoPushToken = await Notifications.getExpoPushTokenAsync({
          projectId: 'fb941144-6082-4e3b-9fbf-7b3aeaa7149a',
        });
        console.log('Expo Push Token obtenido:', expoPushToken.data);
        
        // Guardar el token en el backend
        try {
          const usuario = await AsyncStorage.getItem('nombre_usuario');
          
          if (!usuario) {
            console.error('No se encontró el nombre de usuario');
            Alert.alert(
              'Error',
              'No se pudo identificar al usuario. Por favor, inicia sesión nuevamente.',
              [{ text: 'Entendido' }]
            );
            return;
          }

          Alert.alert(
            'Token de Notificaciones',
            'Usuario: ' + usuario + '\n\n' +
            `Token obtenido: ${expoPushToken.data}`,
            [{ text: 'Entendido' }]
          );

          const response = await authenticatedFetch('guardar_token_notificacion', {
            method: 'POST',
            body: JSON.stringify({
              usuario: usuario,
              token_notificacion: expoPushToken.data,
            }),
          });

          const result = await response.json();

          if (!response.ok || !result.success) {
            console.error('[NotificationSetup] Error al guardar token:', result);
            Toast.show({
              type: 'error',
              text1: 'Error al Guardar Token',
              text2: 'No se pudo registrar el token en el servidor.',
              position: 'bottom',
            });
            throw new Error(result.message || 'Error al guardar el token');
          }

          console.log('[NotificationSetup] ✅ Token guardado/actualizado exitosamente');
        } catch (backendError) {
          console.error('Error al guardar el token en el backend:', backendError);
          await logError('HojaRuta', 'guardar_token_notificacion', {
            error: backendError instanceof Error ? backendError.message : String(backendError),
            usuario: nombreUsuario,
          });
          Toast.show({
            type: 'error',
            text1: 'Error al Guardar Token',
            text2: 'No se pudo guardar el token en el backend. Las notificaciones podrían no funcionar correctamente.',
            position: 'bottom',
          });
          // No bloqueamos la activación de notificaciones por un error en el backend
        }
        
        setNotificationsEnabled(true);
        
        Toast.show({
          type: 'success',
          text1: '¡Notificaciones Activadas!',
          text2: 'Recibirás alertas sobre tus hojas de ruta',
          position: 'bottom',
        });
        
      } catch (tokenError) {
        console.error('Error obteniendo token de notificaciones:', tokenError);
        
        // Solo en desarrollo, mostrar el mensaje sobre development builds
        if (__DEV__) {
          Alert.alert(
            'Notificaciones Push',
            'Las notificaciones push requieren un development build. Expo Go ya no soporta notificaciones push desde SDK 53.\n\nPara habilitarlas en desarrollo, crea un build con:\n\nnpx expo prebuild\nnpx expo run:android',
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Más información',
                onPress: () => {
                  Toast.show({
                    type: 'info',
                    text1: 'Documentación',
                    text2: 'Visita docs.expo.dev para más información',
                    position: 'bottom',
                  });
                },
              },
            ]
          );
        } else {
          // En producción, mostrar un error genérico
          Alert.alert(
            'Error',
            'No se pudo activar las notificaciones. Por favor, intenta nuevamente más tarde.',
            [{ text: 'Entendido' }]
          );
        }
      }
    } catch (error) {
      console.error('Error general en notificaciones:', error);
      await logError('HojaRuta', 'handleEnableNotifications', {
        error: error instanceof Error ? error.message : String(error),
        usuario: nombreUsuario,
      });
      Alert.alert(
        'Error',
        'Ocurrió un error al configurar las notificaciones. Por favor, intenta nuevamente.',
        [{ text: 'Entendido' }]
      );
    }
  };

  const handleLogout = async () => {
    await logLogout('Usuario cerró sesión desde panel principal');
    await logoutUser(true);
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="light" />
      
      {/* Header con menú hamburguesa */}
      <View style={styles.topHeader}>
        <Pressable
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
          style={styles.menuButton}
        >
          <Ionicons name="menu-outline" size={24} color="#DCE2F1" />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Panel Principal</Text>
        </View>
        <Pressable onPress={handleLogout} style={styles.headerLogoutButton}>
          <Ionicons name="log-out-outline" size={20} color="#E8727A" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Ionicons name="map-outline" size={48} color="#926FA9" />
          <Text style={styles.title}>Bienvenido{nombreUsuario ? `, ${nombreUsuario}` : ''}</Text>
          <Text style={styles.subtitle}>Tu centro de control</Text>
        </View>

        {/* Navigation Buttons */}
        <View style={styles.buttonContainer}>
          <Pressable 
            style={({ pressed }) => [styles.navButton, pressed && styles.navButtonPressed]}
            onPress={() => router.push('/(drawer)/nueva_hoja_ruta')}
          >
            <Ionicons name="document-text-outline" size={28} color="#926FA9" />
            <Text style={styles.navButtonText}>Ver Hojas de Ruta</Text>
          </Pressable>

          <Pressable 
            style={({ pressed }) => [styles.navButton, pressed && styles.navButtonPressed]}
            onPress={() => router.push('/(drawer)/ubicacion_tiempo_real')}
          >
            <Ionicons name="location-outline" size={28} color="#6A8AAC" />
            <Text style={styles.navButtonText}>Ubicación en Tiempo Real</Text>
          </Pressable>
        </View>

        {/* Notificaciones Push */}
        {!isCheckingPermissions && !notificationsEnabled && (
          <View style={styles.notificationCard}>
            <View style={styles.notificationHeader}>
              <Ionicons name="notifications-outline" size={24} color="#926FA9" />
              <Text style={styles.notificationTitle}>Notificaciones Push</Text>
            </View>
            <Text style={styles.notificationDescription}>
              Activa las notificaciones para recibir alertas sobre tus hojas de ruta y ubicaciones.
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.enableNotificationsButton,
                pressed && styles.enableNotificationsButtonPressed,
              ]}
              onPress={handleEnableNotifications}
            >
              <Ionicons name="notifications" size={20} color="#fff" />
              <Text style={styles.enableNotificationsText}>Activar Notificaciones</Text>
            </Pressable>
          </View>
        )}

        {/* Logout Button */}
        <View style={styles.footer}>
          <View style={styles.footerDivider} />
          <Pressable 
            style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutButtonPressed]}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={22} color="#E8727A" />
            <Text style={styles.logoutButtonText}>Cerrar Sesión</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1222',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#0D1222',
    borderBottomWidth: 1,
    borderBottomColor: '#1E2D45',
  },
  menuButton: {
    padding: 6,
    borderRadius: 8,
  },
  headerTextWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E8ECF7',
  },
  headerLogoutButton: {
    padding: 6,
    borderRadius: 8,
  },
  scrollContent: {
    padding: 20,
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
    paddingTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 16,
    textAlign: 'center',
    color: '#E8ECF7',
  },
  subtitle: {
    fontSize: 16,
    color: '#8A96AC',
    marginTop: 8,
  },
  buttonContainer: {
    gap: 16,
    marginBottom: 30,
    flex: 1,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 12,
    gap: 14,
    backgroundColor: '#1A2540',
    borderWidth: 1,
    borderColor: '#1E2D45',
  },
  navButtonPressed: {
    backgroundColor: '#243353',
    borderColor: '#2A3F5F',
  },
  navButtonText: {
    color: '#C8D4EC',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 20,
  },
  footerDivider: {
    height: 1,
    backgroundColor: '#1E2D45',
    marginBottom: 16,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#0D1222',
    borderWidth: 1,
    borderColor: '#E8727A',
    gap: 10,
  },
  logoutButtonPressed: {
    backgroundColor: '#1A2540',
    borderColor: '#FF8A92',
  },
  logoutButtonText: {
    color: '#E8727A',
    fontSize: 16,
    fontWeight: '600',
  },
  // Tarjeta de notificaciones
  notificationCard: {
    backgroundColor: '#1A2540',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1E2D45',
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  notificationTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E8ECF7',
  },
  notificationDescription: {
    fontSize: 14,
    color: '#8A96AC',
    lineHeight: 20,
    marginBottom: 16,
  },
  enableNotificationsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#926FA9',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
  },
  enableNotificationsButtonPressed: {
    backgroundColor: '#7A5A8F',
  },
  enableNotificationsText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
