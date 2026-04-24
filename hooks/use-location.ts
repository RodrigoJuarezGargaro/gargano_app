import * as Location from 'expo-location';
import { useCallback, useState } from 'react';

export type LocationCoords = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

type LocationState = {
  coords: LocationCoords | null;
  error: string | null;
  loading: boolean;
  permissionGranted: boolean | null;
};

export function useLocation() {
  const [state, setState] = useState<LocationState>({
    coords: null,
    error: null,
    loading: false,
    permissionGranted: null,
  });

  const requestAndFetch = useCallback(async (): Promise<LocationCoords | null> => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setState(prev => ({
        ...prev,
        loading: false,
        permissionGranted: false,
        error: 'Permiso de ubicación denegado.',
      }));
      return null;
    }

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const coords: LocationCoords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
      };

      setState({ coords, error: null, loading: false, permissionGranted: true });
      return coords;
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        permissionGranted: true,
        error: 'No se pudo obtener la ubicación.',
      }));
      return null;
    }
  }, []);

  return {
    ...state,
    requestAndFetch,
  };
}
