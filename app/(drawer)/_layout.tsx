import DrawerContent from '@/components/drawer-content';
import { Drawer } from 'expo-router/drawer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function DrawerLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        drawerContent={(props) => <DrawerContent {...props} />}
        screenOptions={{
          headerShown: false,
          drawerStyle: {
            backgroundColor: '#0D1222',
            width: 280,
          },
          swipeEdgeWidth: 50,
        }}
      >
        <Drawer.Screen
          name="hoja_ruta"
          options={{
            drawerLabel: 'Hoja de Ruta',
          }}
        />
      </Drawer>
    </GestureHandlerRootView>
  );
}
