import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
    Dimensions,
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    View,
    ViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

type Slide = {
  id: string;
  icon: keyof typeof import('@expo/vector-icons/Ionicons').default.glyphMap;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
};

const SLIDES: Slide[] = [
  {
    id: '1',
    icon: 'map-outline',
    iconColor: '#926FA9',
    iconBg: '#1E1030',
    title: 'Tus hojas de ruta',
    description:
      'Visualizá todas las hojas de ruta asignadas para el día. Cada tarjeta muestra el número de hoja, fecha, tractor y chofer asignado.',
  },
  {
    id: '2',
    icon: 'chevron-down-circle-outline',
    iconColor: '#6A8AAC',
    iconBg: '#0E1A2A',
    title: 'Expandí los remitos',
    description:
      'Tocá una hoja de ruta para ver todos sus remitos. Cada remito muestra el cliente, dirección y código postal de entrega.',
  },
  {
    id: '3',
    icon: 'checkmark-circle-outline',
    iconColor: '#6FD78C',
    iconBg: '#0D1F14',
    title: 'Confirmá entregas',
    description:
      'Cuando llegues con el paquete, tocá "Confirmar" para registrar la entrega. El remito quedará marcado como confirmado automáticamente.',
  },
  {
    id: '4',
    icon: 'git-branch-outline',
    iconColor: '#C0D0F5',
    iconBg: '#0E1428',
    title: 'Otras acciones',
    description:
      'Si el cliente no está o el paquete no puede entregarse completo, podés registrar un "Rechazo" o una "Entrega parcial". También podés anular una confirmación si fue un error.',
  },
  {
    id: '5',
    icon: 'rocket-outline',
    iconColor: '#E8A35B',
    iconBg: '#1A0F00',
    title: '¡Todo listo!',
    description:
      'Ya conocés lo esencial. Iniciá sesión con tu usuario y contraseña para comenzar a gestionar tus rutas del día.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setActiveIndex(viewableItems[0].index);
      }
    }
  ).current;

  const handleNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1 });
    }
  };

  const handleFinish = async () => {
    await AsyncStorage.setItem('onboarding_completed', 'true');
    router.replace('/');
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem('onboarding_completed', 'true');
    router.replace('/');
  };

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Skip */}
      {!isLast && (
        <Pressable style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>Saltar</Text>
        </Pressable>
      )}

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <View style={[styles.iconContainer, { backgroundColor: item.iconBg }]}>
              <Ionicons name={item.icon} size={64} color={item.iconColor} />
            </View>
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slideDescription}>{item.description}</Text>
          </View>
        )}
      />

      {/* Dots */}
      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === activeIndex ? styles.dotActive : styles.dotInactive]}
          />
        ))}
      </View>

      {/* Botón */}
      <View style={styles.buttonContainer}>
        {isLast ? (
          <Pressable style={styles.finishButton} onPress={handleFinish}>
            <Text style={styles.finishButtonText}>Ir al inicio de sesión</Text>
            <Ionicons name="arrow-forward-outline" size={18} color="#F6F1FB" />
          </Pressable>
        ) : (
          <Pressable style={styles.nextButton} onPress={handleNext}>
            <Text style={styles.nextButtonText}>Siguiente</Text>
            <Ionicons name="arrow-forward-outline" size={18} color="#F6F1FB" />
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#06080D',
    alignItems: 'center',
  },
  skipButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  skipText: {
    color: '#6A7A96',
    fontSize: 14,
    fontWeight: '600',
  },
  slide: {
    width,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    gap: 24,
  },
  iconContainer: {
    width: 140,
    height: 140,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1E2D45',
  },
  slideTitle: {
    color: '#E8ECF7',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  slideDescription: {
    color: '#9AA3B6',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    height: 8,
    borderRadius: 99,
  },
  dotActive: {
    width: 24,
    backgroundColor: '#926FA9',
  },
  dotInactive: {
    width: 8,
    backgroundColor: '#2E3D56',
  },
  buttonContainer: {
    width: '100%',
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3A1F5A',
    borderWidth: 1,
    borderColor: '#673E8A',
    borderRadius: 14,
    height: 52,
  },
  nextButtonText: {
    color: '#F6F1FB',
    fontSize: 16,
    fontWeight: '700',
  },
  finishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#673E8A',
    borderRadius: 14,
    height: 52,
  },
  finishButtonText: {
    color: '#F6F1FB',
    fontSize: 16,
    fontWeight: '700',
  },
});
