import {
  getLastLocationUpdate,
  isLocationTrackingActive,
  LocationUpdate,
  startLocationTracking,
  stopLocationTracking,
} from '@/services/location-tracking';
import { useCallback, useEffect, useState } from 'react';

type BackgroundLocationState = {
  isActive: boolean;
  isStarting: boolean;
  error: string | null;
  lastUpdate: (LocationUpdate & { sentAt: string }) | null;
};

/**
 * Hook para gestionar el tracking de ubicación en segundo plano
 * 
 * @example
 * ```tsx
 * const { isActive, startTracking, stopTracking, refreshStatus } = useBackgroundLocation();
 * 
 * // Iniciar tracking
 * await startTracking();
 * 
 * // Detener tracking
 * await stopTracking();
 * 
 * // Verificar estado actual
 * await refreshStatus();
 * ```
 */
export function useBackgroundLocation() {
  const [state, setState] = useState<BackgroundLocationState>({
    isActive: false,
    isStarting: false,
    error: null,
    lastUpdate: null,
  });

  /**
   * Verifica el estado actual del tracking
   */
  const refreshStatus = useCallback(async () => {
    try {
      const active = await isLocationTrackingActive();
      const lastUpdate = await getLastLocationUpdate();
      
      setState(prev => ({
        ...prev,
        isActive: active,
        lastUpdate,
        error: null,
      }));
      
      return active;
    } catch (error) {
      console.error('[useBackgroundLocation] Error verificando estado:', error);
      setState(prev => ({
        ...prev,
        error: 'Error al verificar el estado del tracking',
      }));
      return false;
    }
  }, []);

  /**
   * Inicia el tracking de ubicación en segundo plano
   */
  const startTracking = useCallback(async (): Promise<boolean> => {
    setState(prev => ({ ...prev, isStarting: true, error: null }));

    try {
      const success = await startLocationTracking();
      
      if (success) {
        setState(prev => ({
          ...prev,
          isActive: true,
          isStarting: false,
          error: null,
        }));
        return true;
      } else {
        setState(prev => ({
          ...prev,
          isActive: false,
          isStarting: false,
          error: 'No se pudo iniciar el tracking. Verifica los permisos de ubicación.',
        }));
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      setState(prev => ({
        ...prev,
        isActive: false,
        isStarting: false,
        error: errorMessage,
      }));
      return false;
    }
  }, []);

  /**
   * Detiene el tracking de ubicación en segundo plano
   */
  const stopTracking = useCallback(async (): Promise<void> => {
    try {
      await stopLocationTracking();
      setState(prev => ({
        ...prev,
        isActive: false,
        error: null,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      setState(prev => ({
        ...prev,
        error: errorMessage,
      }));
    }
  }, []);

  /**
   * Efecto para verificar el estado inicial
   */
  useEffect(() => {
    console.log('[useBackgroundLocation] Verificando estado inicial del tracking...');
    refreshStatus();
    const intervalId = setInterval(refreshStatus, 10 * 1000); // Refrescar cada 10 segundos

    return () => clearInterval(intervalId); // Limpiar el intervalo al desmontar el componente
  }, [refreshStatus]);

  return {
    ...state,
    startTracking,
    stopTracking,
    refreshStatus,
  };
}
