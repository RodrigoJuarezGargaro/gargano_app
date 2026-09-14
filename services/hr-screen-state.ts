import AsyncStorage from '@react-native-async-storage/async-storage';

export const HR_SCREEN_STATE_KEY = '@gargano/hr_screen_state';
export const LAST_SCREEN_KEY = '@gargano/last_screen';

export type LastScreen = 'hoja_ruta' | 'nueva_hoja_ruta';

export type PersistedAnalistaFilters = {
  pendienteImagen: boolean;
  hruta: string;
  remito: string;
};

export type HrScreenState = {
  selectedDate: string;
  filters: PersistedAnalistaFilters;
};

export function parseDateLocal(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) {
    return new Date();
  }
  return new Date(y, m - 1, d);
}

export async function loadHrScreenState(): Promise<HrScreenState | null> {
  try {
    const raw = await AsyncStorage.getItem(HR_SCREEN_STATE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<HrScreenState>;
    if (!parsed?.selectedDate) {
      return null;
    }
    return {
      selectedDate: parsed.selectedDate,
      filters: {
        pendienteImagen: Boolean(parsed.filters?.pendienteImagen),
        hruta: String(parsed.filters?.hruta ?? ''),
        remito: String(parsed.filters?.remito ?? ''),
      },
    };
  } catch {
    return null;
  }
}

export async function saveHrScreenState(state: HrScreenState): Promise<void> {
  try {
    await AsyncStorage.setItem(HR_SCREEN_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('[hr-screen-state] No se pudo guardar el estado de HR:', error);
  }
}

export async function getLastScreen(): Promise<LastScreen | null> {
  try {
    const value = await AsyncStorage.getItem(LAST_SCREEN_KEY);
    if (value === 'hoja_ruta' || value === 'nueva_hoja_ruta') {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setLastScreen(screen: LastScreen): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SCREEN_KEY, screen);
  } catch (error) {
    console.warn('[hr-screen-state] No se pudo guardar la última pantalla:', error);
  }
}
