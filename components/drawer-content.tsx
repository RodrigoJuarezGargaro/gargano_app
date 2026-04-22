import { clearUserSession } from '@/services/session-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function DrawerContent({ navigation }: DrawerContentComponentProps) {
  const router = useRouter();
  const [userName, setUserName] = useState('Usuario');
  const [userMail, setUserMail] = useState('');

  useEffect(() => {
    const load = async () => {
      const session = await AsyncStorage.getItem('userSession');
      if (!session) return;
      const data = JSON.parse(session);
      if (data.nombre_usuario) setUserName(data.nombre_usuario);
      else if (data.login) setUserName(data.login);
    };
    load();
  }, []);

  const handleLogout = async () => {
    await clearUserSession();
    router.replace('/');
  };

  return (
    <DrawerContentScrollView
      contentContainerStyle={styles.container}
      style={styles.scrollView}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoBox}>
          <Text style={styles.logoLetter}>G</Text>
        </View>
        <Text style={styles.companyName}>Gargano Logística</Text>
        <View style={styles.divider} />
        <Text style={styles.userName}>{userName}</Text>
        {userMail ? <Text style={styles.userMail}>{userMail}</Text> : null}
      </View>

      {/* Navegación */}
      <View style={styles.navSection}>
        <Pressable
          style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
          onPress={() => navigation.navigate('hoja_ruta')}
        >
          <Ionicons name="map-outline" size={20} color="#926FA9" />
          <Text style={styles.navItemText}>Hoja de Ruta</Text>
        </Pressable>
      </View>

      {/* Cerrar sesión */}
      <View style={styles.footer}>
        <View style={styles.footerDivider} />
        <Pressable
          style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutButtonPressed]}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={20} color="#E8727A" />
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </Pressable>
      </View>
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    backgroundColor: '#0D1222',
    flex: 1,
  },
  container: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 36,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1E2D45',
  },
  logoBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#673E8A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoLetter: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
  },
  companyName: {
    color: '#E8ECF7',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#1E2D45',
    marginBottom: 10,
  },
  userName: {
    color: '#D0D8EE',
    fontSize: 14,
    fontWeight: '600',
  },
  userMail: {
    color: '#8A96AC',
    fontSize: 12,
    marginTop: 2,
  },
  navSection: {
    paddingHorizontal: 12,
    paddingTop: 16,
    flex: 1,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
  },
  navItemPressed: {
    backgroundColor: '#1A2540',
  },
  navItemText: {
    color: '#C8D4EC',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  footerDivider: {
    height: 1,
    backgroundColor: '#1E2D45',
    marginBottom: 8,
    marginHorizontal: 4,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
  },
  logoutButtonPressed: {
    backgroundColor: '#2A1A1A',
  },
  logoutText: {
    color: '#E8727A',
    fontSize: 14,
    fontWeight: '600',
  },
});
