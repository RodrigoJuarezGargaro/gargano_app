import { useBackgroundLocation } from '@/hooks/use-background-location';
import { useLocation } from '@/hooks/use-location';
import { logAccion, logError, logLogout } from '@/services/logger';
import { clearUserSession } from '@/services/session-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

const API_RESPONSE_TIMEOUT_MS = 120000;

/** Filtros de analista vía backend (obtener_hoja_ruta_por_fecha). */
const USE_SERVER_ANALISTA_FILTERS = true;

const resolveImagenUrl = (det: Record<string, unknown>): string | null => {
  const path = String(det.img_path || '').trim();
  const archivo = String(det.img_archivo || '').trim();

  if (!path && !archivo) {
    return null;
  }
  if (archivo.startsWith('http://') || archivo.startsWith('https://')) {
    return encodeURI(archivo);
  }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    if (!archivo) {
      return encodeURI(path);
    }
    const base = path.endsWith('/') ? path : `${path}/`;
    return encodeURI(`${base}${archivo}`);
  }
  return null;
};

const isPdfUrl = (url: string) => /\.pdf(\?|#|$)/i.test(url);

let motivosRechazoCache: string[] | null = null;

type AnalistaFilters = {
  pendienteImagen: boolean;
  hruta: string;
  remito: string;
};

const emptyAnalistaFilters = (): AnalistaFilters => ({
  pendienteImagen: false,
  hruta: '',
  remito: '',
});

const normalizeSearch = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, '');

const isImagenPendiente = (det: Record<string, unknown>) =>
  String(det.img_estado ?? '').trim() !== '1';

const remitoMatchesQuery = (det: Record<string, unknown>, query: string) => {
  const q = normalizeSearch(query);
  if (!q) {
    return true;
  }

  const letra = String(det.letra || '').trim();
  const sucur = String(det.sucur || '').trim();
  const numero = String(det.numero || '').trim();
  const tdoc = String(det.tdoc || '').trim();
  const combined = normalizeSearch(`${letra}-${sucur}-${numero}`);
  const combinedAlt = normalizeSearch(`${letra}${sucur}${numero}`);
  const numeroOnly = normalizeSearch(numero);
  const full = normalizeSearch(`${tdoc}-${letra}-${sucur}-${numero}`);

  return (
    combined.includes(q) ||
    combinedAlt.includes(q) ||
    numeroOnly.includes(q) ||
    full.includes(q) ||
    q.includes(numeroOnly)
  );
};

const filterDetallesForAnalista = (
  detalles: Record<string, unknown>[],
  filters: AnalistaFilters,
) => {
  return detalles.filter((det) => {
    if (filters.pendienteImagen && !isImagenPendiente(det)) {
      return false;
    }
    if (filters.remito && !remitoMatchesQuery(det, filters.remito)) {
      return false;
    }
    return true;
  });
};

const filterHojaRutaForAnalista = (
  routes: unknown[],
  filters: AnalistaFilters,
) => {
  const hrutaQuery = normalizeSearch(filters.hruta);
  const hasDetalleFilter = filters.pendienteImagen || Boolean(filters.remito.trim());

  return routes
    .map((ruta) => {
      const rutaObj = typeof ruta === 'object' && ruta !== null ? (ruta as Record<string, unknown>) : {};
      const hruta_d = String(rutaObj.hruta_d || '').trim();

      if (hrutaQuery && !normalizeSearch(hruta_d).includes(hrutaQuery)) {
        return null;
      }

      const detalles = Array.isArray(rutaObj.detalles)
        ? (rutaObj.detalles as Record<string, unknown>[])
        : [];

      if (!hasDetalleFilter) {
        return rutaObj;
      }

      const filteredDetalles = filterDetallesForAnalista(detalles, filters);
      if (filteredDetalles.length === 0) {
        return null;
      }

      return { ...rutaObj, detalles: filteredDetalles };
    })
    .filter(Boolean) as Record<string, unknown>[];
};

const formatDateLocal = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export default function NuevaHojaRutaScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [userName, setUserName] = useState('Usuario');
  const [name, setName] = useState('Usuario');
  const [hojaRuta, setHojaRuta] = useState<unknown[]>([]);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [expandedDetalles, setExpandedDetalles] = useState<Set<string>>(new Set());
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [userRol, setUserRol] = useState('');
  const { requestAndFetch: fetchLocation } = useLocation();
  const { isActive: isTrackingActive, startTracking, stopTracking, lastUpdate } = useBackgroundLocation();
  const [validationModal, setValidationModal] = useState<{
    visible: boolean;
    details: string;
    onConfirm: () => void;
  }>({ visible: false, details: '', onConfirm: () => {} });

  const [motivosRechazo, setMotivosRechazo] = useState<string[]>([]);
  const [isLoadingMotivos, setIsLoadingMotivos] = useState(false);

  const [mapaModal, setMapaModal] = useState<{
    visible: boolean;
    puntos: { latitude: number; longitude: number; label: string }[];
  }>({ visible: false, puntos: [] });

  const [rechazarModal, setRechazarModal] = useState<{
    visible: boolean;
    selectedMotivo: string | null;
    params: {
      hruta_d: string;
      cliente: string;
      empresa: string;
      tdoc: string;
      letra: string;
      sucursal: string;
      numero: string;
      fecha: string;
    } | null;
  }>({ visible: false, selectedMotivo: null, params: null });

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [analistaFilters, setAnalistaFilters] = useState<AnalistaFilters>(emptyAnalistaFilters);
  const selectedDateRef = useRef(selectedDate);
  const analistaFiltersRef = useRef(analistaFilters);
  selectedDateRef.current = selectedDate;
  analistaFiltersRef.current = analistaFilters;

  const [consultarModal, setConsultarModal] = useState<{
    visible: boolean;
    mensaje: string;
    chofer: string;
    cliente: string;
    remito: string;
  }>({ visible: false, mensaje: '', chofer: '', cliente: '', remito: '' });
  const [imagenModal, setImagenModal] = useState<{
    visible: boolean;
    url: string;
    titulo: string;
    isPdf: boolean;
    loading: boolean;
    error: boolean;
  }>({ visible: false, url: '', titulo: '', isPdf: false, loading: false, error: false });
  const [isConfirmingDelivery, setIsConfirmingDelivery] = useState(false);
  const [choferesConNotificaciones, setChoferesConNotificaciones] = useState<Map<string, boolean>>(new Map());


  useEffect(() => {
    const loadSession = async () => {
      const session = await AsyncStorage.getItem('userSession');
      if (!session) {
        router.replace('/');
        return;
      }

      const sessionData = JSON.parse(session);

      let displayName = 'Usuario';
      if (sessionData.nombre) {
        setUserName(sessionData.nombre);
        setName(sessionData.nombre_usuario);
        displayName = sessionData.nombre;
      } else if (sessionData.login) {
        setUserName(String(sessionData.nombre || sessionData.login).trim());
        setName(sessionData.login);
        displayName = String(sessionData.nombre || sessionData.login).trim();
      }

      const rol = String(sessionData.perfil_nombre || sessionData.rol || '').trim().toLowerCase();
      setUserRol(rol);
      await fetchHojaRuta(displayName, rol);
    };

    loadSession();
  }, [router]);

  useEffect(() => {
    const manageTracking = async () => {
      if (userRol !== 'chofer') {
        // Si no es chofer pero el tracking está activo, detenerlo
        if (isTrackingActive) {
          console.log('[HojaRuta] Deteniendo tracking: usuario no es chofer');
          await stopTracking();
        }
        return;
      }

      // Si ya está activo, no hacer nada
      if (isTrackingActive) {
        console.log('[HojaRuta] Tracking ya está activo');
        return;
      }

      // Verificar si es la primera vez que se piden permisos
      const permissionsRequested = await AsyncStorage.getItem('locationPermissionsRequested');
      
      if (!permissionsRequested) {
        // Primera vez: pedir permisos y guardar que ya se pidieron
        console.log('[HojaRuta] Primera vez: solicitando permisos de ubicación');
        
        Toast.show({
          type: 'info',
          text1: 'Permisos de ubicación',
          text2: 'Por favor autoriza el acceso a tu ubicación para el seguimiento de ruta',
          position: 'bottom',
          visibilityTime: 4000,
        });

        // Esperar 1 segundo para que el usuario vea el mensaje
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Intentar iniciar tracking (esto pedirá los permisos)
        const success = await startTracking();
        
        // Guardar que ya se pidieron permisos (independientemente del resultado)
        await AsyncStorage.setItem('locationPermissionsRequested', 'true');
        
        if (success) {
          console.log('[HojaRuta] ✅ Tracking activado exitosamente');
          Toast.show({
            type: 'success',
            text1: 'Seguimiento de ubicación activado',
            text2: 'Tu ubicación será registrada automáticamente durante tus rutas',
            position: 'bottom',
            visibilityTime: 3000,
          });
        } else {
          console.log('[HojaRuta] ⚠️ No se pudo activar el tracking (permisos denegados)');
          Toast.show({
            type: 'error',
            text1: 'Permisos denegados',
            text2: 'No podremos registrar tu ubicación sin los permisos necesarios',
            position: 'bottom',
            visibilityTime: 4000,
          });
        }
      } else {
        // No es la primera vez: iniciar tracking silenciosamente
        console.log('[HojaRuta] Iniciando tracking automáticamente (silencioso)');
        const success = await startTracking();
        
        if (success) {
          console.log('[HojaRuta] ✅ Tracking activado exitosamente');
        } else {
          console.log('[HojaRuta] ⚠️ No se pudo activar el tracking (verificar permisos en configuración)');
        }
      }
    };

    // Solo ejecutar si ya tenemos el rol del usuario
    if (userRol) {
      manageTracking();
    }
  }, [userRol, isTrackingActive, startTracking, stopTracking]);

  const fetchHojaRuta = async (
    nombre: string,
    rol: string,
    fecha?: Date,
    filters?: AnalistaFilters,
  ) => {
    setIsLoadingRoutes(true);
    try {
      let response: Response;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_RESPONSE_TIMEOUT_MS);
      try {
        if (rol === 'analista') {
          // Siempre respetar la fecha filtrada (evitar caer en "hoy" por closures viejos).
          const dateToUse = fecha ?? selectedDateRef.current ?? new Date();
          const formattedDate = formatDateLocal(dateToUse);
          const activeFilters = filters ?? analistaFiltersRef.current;

          // Query params aparte del endpoint (el proxy los reenvía a Laravel).
          const query = new URLSearchParams();
          query.set('endpoint', `obtener_hoja_ruta_por_fecha/${formattedDate}`);
          if (USE_SERVER_ANALISTA_FILTERS) {
            if (activeFilters.pendienteImagen) {
              query.set('pendiente_imagen', '1');
            }
            if (activeFilters.hruta.trim()) {
              query.set('hruta_d', activeFilters.hruta.trim());
            }
            if (activeFilters.remito.trim()) {
              query.set('remito', activeFilters.remito.trim());
            }
          }

          response = await fetch(
            `https://gargano-proxy.vercel.app/api/proxy?${query.toString()}`,
            { method: 'GET', signal: controller.signal }
          );
        } else if (rol === 'admin' || rol === 'trafico') {
          response = await fetch(
            'https://gargano-proxy.vercel.app/api/proxy?endpoint=obtener_hoja_ruta_diaria',
            { method: 'GET', signal: controller.signal }
          );
        } else {
          const cleanName = nombre.trim();
          if (!cleanName) {
            console.warn('Nombre vacío, no se puede buscar hoja de ruta');
            setIsLoadingRoutes(false);
            return;
          }
          response = await fetch(
            `https://gargano-proxy.vercel.app/api/proxy?endpoint=obtener_hoja_ruta/${encodeURIComponent(cleanName)}`,
            { signal: controller.signal }
          );
        }
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        Toast.show({ type: 'error', text1: 'Error al obtener hoja de ruta. Intenta nuevamente más tarde.' });
        console.error('1_ Error fetching hoja de ruta:', response.status);
        setIsLoadingRoutes(false);
        return;
      }

      const data = await response.json();
      // console.log('Hoja de ruta data:', data);
      const routes = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      setHojaRuta(routes);
      
      // Verificar notificaciones de choferes
      await verificarNotificacionesChoferes(routes);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('Hoja de ruta timeout: el backend tardo mas de 120 segundos en responder.');
        await logError('NuevaHojaRuta', 'obtener_hoja_ruta', {
          error: 'Timeout - backend tardó más de 120 segundos',
          rol: userRol,
          nombre: userName,
        });
        return;
      }
      console.error('2_ Error fetching hoja de ruta:', error);
      await logError('NuevaHojaRuta', 'obtener_hoja_ruta', {
        error: error instanceof Error ? error.message : String(error),
        rol: userRol,
        nombre: userName,
      });
    } finally {
      setIsLoadingRoutes(false);
    }
  };

  /** Recarga manteniendo fecha y filtros del analista. */
  const refreshHojaRuta = async () => {
    await fetchHojaRuta(
      userName,
      userRol,
      selectedDateRef.current,
      analistaFiltersRef.current,
    );
  };

  const verificarNotificacionesChoferes = async (routes: unknown[]) => {
    // Extraer choferes únicos
    const choferesUnicos = new Set<string>();
    routes.forEach(ruta => {
      const rutaObj = typeof ruta === 'object' && ruta !== null ? (ruta as Record<string, unknown>) : {};
      const chofer = String(rutaObj.cod_chof || '').trim();
      if (chofer && chofer !== '-') {
        choferesUnicos.add(chofer);
      }
    });

    // Consultar endpoint para cada chofer
    const resultados = new Map<string, boolean>();
    const promesas = Array.from(choferesUnicos).map(async (chofer) => {
      try {
        const response = await fetch(
          `https://gargano-proxy.vercel.app/api/proxy?endpoint=verificar_token_notificacion/${encodeURIComponent(chofer)}`,
          { method: 'GET' }
        );
        
        if (response.status === 200) {
          resultados.set(chofer, true);
        } else {
          resultados.set(chofer, false);
        }
      } catch (error) {
        console.error(`Error verificando notificaciones de ${chofer}:`, error);
        resultados.set(chofer, false);
      }
    });

    await Promise.all(promesas);
    setChoferesConNotificaciones(resultados);
  };

  const formateoFecha = (fecha: string) => {
    const [anio, mes, dia] = fecha.split('T')[0].split('-');
    return `${dia}/${mes}/${anio}`;
  };

  const handleLogout = async () => {
    await logLogout(`Usuario ${userName} cerró sesión desde nueva hoja de ruta`);
    await clearUserSession();
    router.replace('/');
  };

  const updateDetalleOptimistically = (
    empresa: string,
    tdoc: string,
    letra: string,
    sucursal: string,
    numero: string,
    confirmado: boolean,
  ) => {
    setHojaRuta(prev =>
      prev.map(ruta => {
        const rutaObj = typeof ruta === 'object' && ruta !== null ? (ruta as Record<string, unknown>) : {};
        const detalles = Array.isArray(rutaObj.detalles) ? (rutaObj.detalles as Record<string, unknown>[]) : [];
        const updatedDetalles = detalles.map(det =>
          String(det.empresa || '').trim() === empresa &&
          String(det.tdoc || '').trim() === tdoc &&
          String(det.letra || '').trim() === letra &&
          String(det.sucur || '').trim() === sucursal &&
          String(det.numero || '').trim() === numero
            ? { ...det, confirmado }
            : det
        );
        return { ...rutaObj, detalles: updatedDetalles };
      })
    );
  };

  const handleConfirmDelivery = (
    hruta_d: string,
    cliente: string,
    empresa: string,
    tdoc: string,
    letra: string,
    sucursal: string,
    numero: string,
    fecha: string,
  ) => {
    Alert.alert(
      '¿Confirmar entrega?',
      `Cliente: ${cliente}\nHoja de ruta: ${hruta_d}\n\nAl confirmar, se te pedirá tomar una foto de la entrega.`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Confirmar y tomar foto',
          onPress: async () => {
            setIsConfirmingDelivery(true);
            void logAccion('confirmacion', {
              resultado: 'iniciado',
              hruta_d,
              cliente,
              empresa,
              tdoc,
              letra,
              sucursal,
              numero,
              fecha,
              remito: `${letra}-${sucursal}-${numero}`,
            });
            try {
              // 1. Verificar si el remito existe
              const existeResponse = await fetch(
                'https://gargano-proxy.vercel.app/api/proxy?endpoint=existe_hoja_ruta_rem_cab_app',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                  body: JSON.stringify({
                    empresa,
                    tdoc,
                    letra,
                    sucursal,
                    numero,
                    fecha,
                    hruta_d: parseInt(hruta_d, 10),
                  }),
                }
              );
              const existeData = await existeResponse.json();
              if (!existeResponse.ok) {
                setIsConfirmingDelivery(false);
                Toast.show({ type: 'error', text1: existeData?.error ? JSON.stringify(existeData.error) : 'No se pudo verificar el remito.' });
                return;
              }

              if (!existeData?.existe) {
                // 2. Si no existe, insertar
                const insertarResponse = await fetch(
                  'https://gargano-proxy.vercel.app/api/proxy?endpoint=insertar_remito_app',
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({
                      empresa,
                      tdoc,
                      letra,
                      sucursal,
                      numero,
                      hruta_d: parseInt(hruta_d, 10),
                      usuario: userName,
                    }),
                  }
                );
                const insertarData = await insertarResponse.json();
                if (!insertarResponse.ok) {
                  // Toast.show({ type: 'error', text1: insertarData?.error ? JSON.stringify(insertarData.error) : 'No se pudo insertar el remito.' });
                  console.error('Error insertando remito:', insertarResponse.status, insertarData);
                  setIsConfirmingDelivery(false);
                  return;
                }

                if (!insertarData?.insertado) {
                  console.error('Error insertando remito:', insertarResponse.status, insertarData);
                  setIsConfirmingDelivery(false);
                  Toast.show({ type: 'error', text1: 'No se pudo insertar el remito.' });
                  return;
                }
              } else {
                // 3. Si existe, actualizar
                const actualizarResponse = await fetch(
                  'https://gargano-proxy.vercel.app/api/proxy?endpoint=actualizar_remito_app_fecha_actual',
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({
                      empresa,
                      tdoc,
                      letra,
                      sucursal,
                      numero,
                      hruta_d: parseInt(hruta_d, 10),
                      usuario: userName,
                    }),
                  }
                );
                const actualizarData = await actualizarResponse.json();
                if (!actualizarResponse.ok) {
                  setIsConfirmingDelivery(false);
                  Toast.show({ type: 'error', text1: actualizarData?.error ? JSON.stringify(actualizarData.error) : 'No se pudo actualizar el remito.' });
                  return;
                }

                if (!actualizarData?.actualizado) {
                  setIsConfirmingDelivery(false);
                  Toast.show({ type: 'error', text1: 'No se pudo actualizar el remito.' });
                  return;
                }
              }

              // 4. Paso final: guardar fecha de entrega
              const guardarFechaResponse = await fetch(
                'https://gargano-proxy.vercel.app/api/proxy?endpoint=guardar_fecha_entrega_remito_app',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                  body: JSON.stringify({
                    empresa,
                    tdoc,
                    letra,
                    sucursal,
                    numero,
                  }),
                }
              );
              const guardarFechaData = await guardarFechaResponse.json();
              if (!guardarFechaResponse.ok) {
                setIsConfirmingDelivery(false);
                Toast.show({ type: 'error', text1: guardarFechaData?.error ? JSON.stringify(guardarFechaData.error) : 'No se pudo guardar la fecha de entrega.' });
                return;
              }

              if (guardarFechaData?.actualizado) {
                updateDetalleOptimistically(empresa, tdoc, letra, sucursal, numero, true);
                Toast.show({ type: 'success', text1: 'Entrega confirmada correctamente.' });
                void logAccion('confirmacion', {
                  resultado: 'ok',
                  hruta_d,
                  cliente,
                  empresa,
                  tdoc,
                  letra,
                  sucursal,
                  numero,
                  fecha,
                  remito: `${letra}-${sucursal}-${numero}`,
                });
                await refreshHojaRuta();
                
                // 5. Abrir cámara automáticamente para tomar la foto
                // Se usa setTimeout para dar tiempo a que se cierre el Alert y se muestre el Toast
                setTimeout(() => {
                  setIsConfirmingDelivery(false);
                  handleTakePhoto(empresa, tdoc, letra, sucursal, numero);
                }, 500);
              } else {
                setIsConfirmingDelivery(false);
                Toast.show({ type: 'error', text1: 'No se pudo guardar la fecha de entrega.' });
              }
            } catch (error) {
              console.error('Error confirmando entrega:', error);
              setIsConfirmingDelivery(false);
              void logAccion('confirmacion', {
                resultado: 'error',
                hruta_d,
                cliente,
                empresa,
                remito: `${letra}-${sucursal}-${numero}`,
                error: error instanceof Error ? error.message : String(error),
              });
              Toast.show({ type: 'error', text1: 'No se pudo conectar con el servidor.' });
            }
          },
        },
      ]
    );
  };

  const handleUndoConfirmation = (
    hruta_d: string,
    cliente: string,
    empresa: string,
    tdoc: string,
    letra: string,
    sucursal: string,
    numero: string,
    fecha: string,
  ) => {
    Alert.alert(
      'Anular confirmacion',
      `¿Anular la confirmacion de ${cliente}?\nHoja de ruta: ${hruta_d}`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Anular',
          style: 'destructive',
          onPress: async () => {
            try {
              const anularResponse = await fetch(
                'https://gargano-proxy.vercel.app/api/proxy?endpoint=anular_remito_app',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                  body: JSON.stringify({
                    empresa,
                    tdoc,
                    letra,
                    sucursal,
                    numero,
                    usuario: userName,
                    fecha,
                  }),
                }
              );
              const anularData = await anularResponse.json();
              if (!anularResponse.ok) {
                Toast.show({ type: 'error', text1: anularData?.error ? JSON.stringify(anularData.error) : 'No se pudo anular el remito.' });
                return;
              }

              if (anularData?.anulado) {
                updateDetalleOptimistically(empresa, tdoc, letra, sucursal, numero, false);
                Toast.show({ type: 'success', text1: 'Confirmacion anulada correctamente.' });
                await refreshHojaRuta();
              } else {
                Toast.show({ type: 'error', text1: 'No se pudo anular el remito.' });
              }
            } catch (error) {
              console.error('Error anulando entrega:', error);
              await logError('NuevaHojaRuta', 'anular_remito_app', {
                error: error instanceof Error ? error.message : String(error),
                remito: `${empresa}-${tdoc}-${letra}-${sucursal}-${numero}`,
              });
              Toast.show({ type: 'error', text1: 'No se pudo conectar con el servidor.' });
            }
          },
        },
      ]
    );
  };

  const loadMotivosRechazo = async () => {
    if (motivosRechazoCache) {
      setMotivosRechazo(motivosRechazoCache);
      return;
    }
    setIsLoadingMotivos(true);
    try {
      const response = await fetch(
        'https://gargano-proxy.vercel.app/api/proxy?endpoint=obtener_estados_remito_cabecera/rechazo',
        { method: 'GET' }
      );
      if (!response.ok) {
        Toast.show({ type: 'error', text1: 'No se pudieron cargar los motivos de rechazo.' });
        return;
      }
      const data = await response.json();
      const motivos: string[] = Array.isArray(data?.estados)
        ? data.estados.map((e: { nombre: string }) => String(e.nombre))
        : [];
      motivosRechazoCache = motivos;
      setMotivosRechazo(motivos);
    } catch {
      Toast.show({ type: 'error', text1: 'No se pudieron cargar los motivos de rechazo.' });
    } finally {
      setIsLoadingMotivos(false);
    }
  };

  const handleRejectDelivery = (
    hruta_d: string,
    cliente: string,
    empresa: string,
    tdoc: string,
    letra: string,
    sucursal: string,
    numero: string,
    fecha: string,
  ) => {
    setRechazarModal({
      visible: true,
      selectedMotivo: null,
      params: { hruta_d, cliente, empresa, tdoc, letra, sucursal, numero, fecha },
    });
    loadMotivosRechazo();
  };

  const confirmRechazar = async () => {
    const p = rechazarModal.params;
    const motivo = rechazarModal.selectedMotivo;
    if (!p || !motivo) return;
    setRechazarModal(v => ({ ...v, visible: false }));
    void logAccion('rechazo', {
      resultado: 'iniciado',
      hruta_d: p.hruta_d,
      cliente: p.cliente,
      empresa: p.empresa,
      tdoc: p.tdoc,
      letra: p.letra,
      sucursal: p.sucursal,
      numero: p.numero,
      fecha: p.fecha,
      remito: `${p.letra}-${p.sucursal}-${p.numero}`,
      motivo_rechazo: motivo,
    });
    try {
      const rechazarResponse = await fetch(
        'https://gargano-proxy.vercel.app/api/proxy?endpoint=rechazar_remito_app',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            empresa: p.empresa,
            tdoc: p.tdoc,
            letra: p.letra,
            sucursal: p.sucursal,
            numero: p.numero,
            usuario: userName,
            hruta_d: parseInt(p.hruta_d, 10),
            fecha: p.fecha,
            motivo_rechazo: motivo,
          }),
        }
      );
      const rechazarData = await rechazarResponse.json();
      if (!rechazarResponse.ok) {
        Toast.show({ type: 'error', text1: rechazarData?.error ? JSON.stringify(rechazarData.error) : 'No se pudo rechazar el remito.' });
        return;
      }
      if (rechazarData?.rechazado) {
        updateDetalleOptimistically(p.empresa, p.tdoc, p.letra, p.sucursal, p.numero, true);
        Toast.show({ type: 'success', text1: 'Remito rechazado correctamente.' });
        void logAccion('rechazo', {
          resultado: 'ok',
          hruta_d: p.hruta_d,
          cliente: p.cliente,
          empresa: p.empresa,
          remito: `${p.letra}-${p.sucursal}-${p.numero}`,
          motivo_rechazo: motivo,
        });
        await refreshHojaRuta();
      } else {
        Toast.show({ type: 'error', text1: 'No se pudo rechazar el remito.' });
        void logAccion('rechazo', {
          resultado: 'error',
          hruta_d: p.hruta_d,
          remito: `${p.letra}-${p.sucursal}-${p.numero}`,
          motivo_rechazo: motivo,
        });
      }
    } catch (error) {
      console.error('Error rechazando remito:', error);
      void logAccion('rechazo', {
        resultado: 'error',
        hruta_d: p.hruta_d,
        remito: `${p.letra}-${p.sucursal}-${p.numero}`,
        motivo_rechazo: motivo,
        error: error instanceof Error ? error.message : String(error),
      });
      Toast.show({ type: 'error', text1: 'No se pudo conectar con el servidor.' });
    }
  };

  const handleTakePhoto = async (empresa: string, tdoc: string, letra: string, sucur: string, numero: string) => {
    const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
    if (locationStatus !== 'granted') {
      Alert.alert('Permiso de ubicación requerido', 'Se necesita permiso de ubicación para sacar la foto. Por favor, habilítalo en la configuración.');
      return;
    }

    const coords = await fetchLocation();
    let place: Location.LocationGeocodedAddress | null = null;

    if (coords) {
      try {
        const [result] = await Location.reverseGeocodeAsync({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        place = result ?? null;
      } catch {
        console.log('[handleTakePhoto] Ubicación coords:', JSON.stringify(coords));
        console.warn('[handleTakePhoto] No se pudo hacer geocodificación inversa.');
      }
    } else {
      console.warn('[handleTakePhoto] No se pudo obtener la ubicación.');
    }
    
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Se necesita permiso para acceder a la cámara.');
      return;
    }
    Toast.show({ type: 'info', text1: 'Abriendo cámara...' });
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        mediaTypes: ['images'],
        allowsEditing: false,
        exif: false,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // En algunos Android el proceso de cámara termina con una excepción aunque la foto se sacó.
      // Si el mensaje es de cancelación o de activity result, lo ignoramos silenciosamente.
      const isBenign = msg.includes('cancel') || msg.includes('E_PICKER_CANCELLED') || msg.includes('activity');
      if (!isBenign) {
        Alert.alert('Error al abrir la cámara', msg);
      }
      return;
    }

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const key = `${empresa}-${letra}-${sucur}-${numero}`;
    setUploadingKey(key);

    const imagePayload = {
      uri: asset.uri,
      type: asset.mimeType ?? 'image/jpeg',
      name: `foto_${letra}-${sucur}-${numero}.jpg`,
    } as unknown as Blob;

    const guardarImagen = async () => {
      const formData = new FormData();
      formData.append('empresa', empresa);
      formData.append('tdoc', tdoc);
      formData.append('letra', letra);
      formData.append('sucur', sucur);
      formData.append('numero', numero);
      formData.append('imagen', imagePayload);
      formData.append('usuario', userName);
      if (coords) {
        formData.append('coordenadas', JSON.stringify({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
        }));
      }
      if (place) {
        formData.append('ubicacion', JSON.stringify({
          ciudad:       place.city          ?? null,
          localidad:    place.district      ?? null,
          provincia:    place.region        ?? null,
          pais:         place.country       ?? null,
          calle:        place.street        ?? null,
          numero:       place.streetNumber  ?? null,
          codigoPostal: place.postalCode    ?? null,
        }));
      }

      try {
        const response = await fetch(
          'https://gargano-proxy.vercel.app/api/proxy?endpoint=guardar_imagen_remito_app',
          { method: 'POST', body: formData }
        );
        const data = await response.json();
        if (!response.ok) {
          Alert.alert('Error', data?.error ? JSON.stringify(data.error) : 'No se pudo guardar la imagen.');
          return;
        }
        Alert.alert('Éxito', 'Imagen guardada correctamente.');
      } catch (error) {
        console.error('Error guardando imagen:', error);
        await logError('NuevaHojaRuta', 'guardar_imagen_remito_app', {
          error: error instanceof Error ? error.message : String(error),
          remito: `${empresa}-${tdoc}-${letra}-${sucur}-${numero}`,
        });
        Alert.alert('Error', 'No se pudo conectar con el servidor.');
      } finally {
        setUploadingKey(null);
      }
    };

    try {
      // Paso 1: validar imagen con Gemini
      const validarFormData = new FormData();
      validarFormData.append('imagen', imagePayload);

      const validarResponse = await fetch(
        'https://gargano-proxy.vercel.app/api/proxy?endpoint=validar_imagen_remito_app',
        { method: 'POST', body: validarFormData }
      );
      const validarData = await validarResponse.json();

      if (validarResponse.status === 200 && validarData?.es_valida) {
        // Imagen válida, guardar directamente
        await guardarImagen();
      } else if (validarResponse.status === 400) {
        setUploadingKey(null);
        Alert.alert('Error', validarData?.error ? JSON.stringify(validarData.error) : 'La imagen no es válida.');
      } else {
        console.error('Error validando imagen:', validarResponse.status, validarData);
        let detalles = '';
        if (validarResponse.status === 422) {
          const motivo = validarData?.motivo_rechazo ? String(validarData.motivo_rechazo) : '';
          const desc = validarData?.descripcion ? String(validarData.descripcion) : '';
          detalles = [motivo, desc].filter(Boolean).join('\n') || 'Imagen rechazada por Gemini.';
        } else if (validarResponse.status === 502) {
          detalles = validarData?.error ? String(validarData.error) : 'API de Gemini no disponible.';
        } else {
          detalles = validarData?.error ? JSON.stringify(validarData.error) : 'Error desconocido.';
        }
        setValidationModal({ visible: true, details: detalles, onConfirm: guardarImagen });
      }
    } catch (error) {
      setUploadingKey(null);
      Alert.alert('Error', 'No se pudo conectar con el servidor.');
    }
  };

  const handleVerRecorrido = (detalles: Record<string, unknown>[]) => {
    const parseCoordenadas = (raw: unknown): { latitude: number; longitude: number } | null => {
      const str = String(raw || '').trim();
      if (!str) return null;
      const latMatch = str.match(/"latitude"\s*:\s*(-?\d+(?:\.\d+)?)/);
      const lonMatch = str.match(/"longitude"\s*:\s*(-?\d+(?:\.\d+)?)/);
      if (latMatch && lonMatch) {
        return { latitude: parseFloat(latMatch[1]), longitude: parseFloat(lonMatch[1]) };
      }
      return null;
    };
    console.log('Detalles para recorrido:', detalles);
    const puntos = detalles
      .map(det => {
        const coords = parseCoordenadas(det.coordenadas);
        if (!coords) return null;
        const label = String(det.cliente || det.direccion || '').trim();
        return { ...coords, label };
      })
      .filter(Boolean) as { latitude: number; longitude: number; label: string }[];
    
    console.log('Puntos con coordenadas:', puntos);
    if (puntos.length === 0) {
      Alert.alert('Sin coordenadas', 'No hay coordenadas GPS registradas para este recorrido.');
      return;
    }

    setMapaModal({ visible: true, puntos });
  };

  const handlePartialDelivery = (
    hruta_d: string,
    cliente: string,
    empresa: string,
    tdoc: string,
    letra: string,
    sucursal: string,
    numero: string,
    fecha: string,
  ) => {
    Alert.alert(
      'Entrega parcial',
      `¿Registrar entrega parcial a ${cliente}?\nHoja de ruta: ${hruta_d}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            void logAccion('parcial', {
              resultado: 'iniciado',
              hruta_d,
              cliente,
              empresa,
              tdoc,
              letra,
              sucursal,
              numero,
              fecha,
              remito: `${letra}-${sucursal}-${numero}`,
            });
            try {
              const parcialResponse = await fetch(
                'https://gargano-proxy.vercel.app/api/proxy?endpoint=entrega_parcial_remito_app',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                  body: JSON.stringify({
                    empresa,
                    tdoc,
                    letra,
                    sucursal,
                    numero,
                    usuario: userName,
                    hruta_d: parseInt(hruta_d, 10),
                    fecha,
                  }),
                }
              );
              const parcialData = await parcialResponse.json();
              if (!parcialResponse.ok) {
                Toast.show({ type: 'error', text1: parcialData?.error ? JSON.stringify(parcialData.error) : 'No se pudo registrar la entrega parcial.' });
                return;
              }
              if (parcialData?.entrega_parcial) {
                updateDetalleOptimistically(empresa, tdoc, letra, sucursal, numero, true);
                Toast.show({ type: 'success', text1: 'Entrega parcial registrada correctamente.' });
                void logAccion('parcial', {
                  resultado: 'ok',
                  hruta_d,
                  cliente,
                  empresa,
                  remito: `${letra}-${sucursal}-${numero}`,
                });
                await refreshHojaRuta();
              } else {
                Toast.show({ type: 'error', text1: 'No se pudo registrar la entrega parcial.' });
                void logAccion('parcial', {
                  resultado: 'error',
                  hruta_d,
                  remito: `${letra}-${sucursal}-${numero}`,
                });
              }
            } catch (error) {
              console.error('Error registrando entrega parcial:', error);
              void logAccion('parcial', {
                resultado: 'error',
                hruta_d,
                remito: `${letra}-${sucursal}-${numero}`,
                error: error instanceof Error ? error.message : String(error),
              });
              Toast.show({ type: 'error', text1: 'No se pudo conectar con el servidor.' });
            }
          },
        },
      ]
    );
  };

  const handleConsultarChofer = (
    chofer: string,
    cliente: string,
    letra: string,
    sucursal: string,
    numero: string,
  ) => {
    setConsultarModal({
      visible: true,
      mensaje: '',
      chofer,
      cliente,
      remito: `${letra}-${sucursal}-${numero}`,
    });
  };

  const openImagenPreview = (det: Record<string, unknown>, remitoLabel: string) => {
    const url = resolveImagenUrl(det);
    if (!url) {
      Toast.show({
        type: 'error',
        text1: 'Sin imagen',
        text2: 'No hay una URL de imagen disponible para este remito.',
      });
      return;
    }

    const pdf = isPdfUrl(url);
    setImagenModal({
      visible: true,
      url,
      titulo: remitoLabel,
      isPdf: pdf,
      loading: !pdf,
      error: false,
    });
  };

  const enviarConsultaChofer = async () => {
    const { chofer, mensaje, cliente, remito } = consultarModal;
    
    if (!mensaje.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Mensaje vacío',
        text2: 'Por favor escribe una consulta',
      });
      return;
    }

    try {
      const response = await fetch(
        'https://gargano-proxy.vercel.app/api/proxy?endpoint=enviar_notificacion_chofer',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            chofer: chofer,
            titulo: `Consulta sobre ${cliente}`,
            mensaje: mensaje.trim(),
            usuario_origen: userName,
            remito: remito,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (response.status === 404) {
          Toast.show({
            type: 'error',
            text1: 'Notificaciones no disponibles',
            text2: 'El chofer no tiene notificaciones activadas',
          });
        } else {
          Toast.show({
            type: 'error',
            text1: 'Error al enviar',
            text2: data.message || 'No se pudo enviar la notificación',
          });
        }
        return;
      }

      setConsultarModal({ visible: false, mensaje: '', chofer: '', cliente: '', remito: '' });
      Toast.show({
        type: 'success',
        text1: 'Notificación enviada',
        text2: `Consulta enviada a ${chofer}`,
      });
    } catch (error) {
      console.error('Error enviando consulta al chofer:', error);
      Toast.show({
        type: 'error',
        text1: 'Error de conexión',
        text2: 'No se pudo conectar con el servidor',
      });
    }
  };

  const hasActiveAnalistaFilters =
    analistaFilters.pendienteImagen ||
    Boolean(analistaFilters.hruta.trim()) ||
    Boolean(analistaFilters.remito.trim());

  const rutasVisibles = useMemo(() => {
    if (userRol !== 'analista' || USE_SERVER_ANALISTA_FILTERS || !hasActiveAnalistaFilters) {
      return hojaRuta;
    }
    return filterHojaRutaForAnalista(hojaRuta, analistaFilters);
  }, [userRol, hojaRuta, analistaFilters, hasActiveAnalistaFilters]);

  const clearAnalistaFilters = () => {
    const cleared = emptyAnalistaFilters();
    setAnalistaFilters(cleared);
    setExpandedCards(new Set());
    if (USE_SERVER_ANALISTA_FILTERS && userRol === 'analista') {
      void fetchHojaRuta(userName, userRol, selectedDate, cleared);
    }
  };

  const applyAnalistaFiltersToServer = () => {
    setExpandedCards(new Set());
    if (USE_SERVER_ANALISTA_FILTERS && userRol === 'analista') {
      void fetchHojaRuta(userName, userRol, selectedDate, analistaFilters);
      return;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
            style={styles.menuButton}
          >
            <Ionicons name="menu-outline" size={22} color="#DCE2F1" />
          </Pressable>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>Hoja de ruta</Text>
          </View>
          <Pressable onPress={handleLogout} style={styles.logoutButton}>
            <Ionicons name="log-out-outline" size={18} color="#DCE2F1" />
          </Pressable>
        </View>

        <View style={styles.greetingBlock}>
          <Text style={styles.greetingTitle}>Hola, {name}</Text>
        </View>

        {/* COMENTADO PARA EVITAR CRASHES EN DESARROLLO LOCAL */}
        {/* MODO TESTING: Mostrar indicador de tracking para todos los roles */}
        {/* {true && (
          <View style={styles.trackingIndicator}>
            <View style={styles.trackingIndicatorHeader}>
              <View style={styles.trackingIndicatorLeft}>
                <View style={[styles.trackingDot, isTrackingActive ? styles.trackingDotActive : styles.trackingDotInactive]} />
                <Text style={styles.trackingIndicatorTitle}>
                  {isTrackingActive ? '🌍 Seguimiento activo (TESTING)' : 'Seguimiento inactivo'}
                </Text>
              </View>
              <Pressable
                onPress={async () => {
                  if (isTrackingActive) {
                    await stopTracking();
                    Toast.show({
                      type: 'info',
                      text1: 'Seguimiento desactivado',
                      text2: 'Tu ubicación ya no será registrada',
                      position: 'bottom',
                    });
                  } else {
                    const success = await startTracking();
                    if (success) {
                      Toast.show({
                        type: 'success',
                        text1: 'Seguimiento activado',
                        text2: 'Capturando ubicación cada 30 segundos',
                        position: 'bottom',
                      });
                    }
                  }
                }}
                style={[
                  styles.trackingToggleButton,
                  isTrackingActive ? styles.trackingToggleButtonActive : styles.trackingToggleButtonInactive
                ]}
              >
                <Ionicons
                  name={isTrackingActive ? 'pause' : 'play'}
                  size={14}
                  color={isTrackingActive ? '#A0E0B0' : '#B0BAD0'}
                />
                <Text style={[
                  styles.trackingToggleButtonText,
                  isTrackingActive ? styles.trackingToggleButtonTextActive : styles.trackingToggleButtonTextInactive
                ]}>
                  {isTrackingActive ? 'Pausar' : 'Iniciar'}
                </Text>
              </Pressable>
            </View>
            {isTrackingActive && lastUpdate && (
              <View style={styles.trackingLastUpdate}>
                <Ionicons name="location-outline" size={12} color="#8A96AC" />
                <Text style={styles.trackingLastUpdateText}>
                  Última actualización: {new Date(lastUpdate.sentAt).toLocaleTimeString('es-AR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })} - Lat: {lastUpdate.latitude.toFixed(6)}, Lng: {lastUpdate.longitude.toFixed(6)}
                </Text>
              </View>
            )}
          </View>
        )}
        */}
        {/* MODO PRODUCCIÓN: Cambiar {true && ( por {userRol === 'chofer' && ( */}

        {userRol === 'analista' && (
          <View style={styles.datePickerBlock}>
            <Text style={styles.datePickerLabel}>Seleccionar fecha:</Text>
            <Pressable
              style={styles.datePickerButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={18} color="#A0C4FF" />
              <Text style={styles.datePickerButtonText}>
                {selectedDate.toLocaleDateString('es-AR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
              </Text>
            </Pressable>
            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display="default"
                onChange={(event, date) => {
                  setShowDatePicker(false);
                  if (date) {
                    setSelectedDate(date);
                    fetchHojaRuta(userName, userRol, date, analistaFilters);
                  }
                }}
              />
            )}

            <Text style={[styles.datePickerLabel, { marginTop: 14 }]}>Filtros</Text>

            <Pressable
              style={[
                styles.filterChip,
                analistaFilters.pendienteImagen && styles.filterChipActive,
              ]}
              onPress={() => {
                const nextFilters = {
                  ...analistaFilters,
                  pendienteImagen: !analistaFilters.pendienteImagen,
                };
                setAnalistaFilters(nextFilters);
                setExpandedCards(new Set());
                if (USE_SERVER_ANALISTA_FILTERS) {
                  void fetchHojaRuta(userName, userRol, selectedDate, nextFilters);
                }
              }}
            >
              <Ionicons
                name="image-outline"
                size={16}
                color={analistaFilters.pendienteImagen ? '#F2F5FB' : '#A0C4FF'}
              />
              <Text
                style={[
                  styles.filterChipText,
                  analistaFilters.pendienteImagen && styles.filterChipTextActive,
                ]}
              >
                Pendiente de imagen
              </Text>
            </Pressable>

            <View style={styles.filterInputRow}>
              <Ionicons name="document-text-outline" size={16} color="#8A96AC" />
              <TextInput
                style={styles.filterInput}
                placeholder="Buscar HR (ej: 247632)"
                placeholderTextColor="#6A7A96"
                value={analistaFilters.hruta}
                keyboardType="number-pad"
                onChangeText={(text) =>
                  setAnalistaFilters((prev) => ({ ...prev, hruta: text }))
                }
                onSubmitEditing={applyAnalistaFiltersToServer}
                returnKeyType="search"
              />
            </View>

            <View style={styles.filterInputRow}>
              <Ionicons name="receipt-outline" size={16} color="#8A96AC" />
              <TextInput
                style={styles.filterInput}
                placeholder="Buscar remito (ej: R-1-1016 o 1016)"
                placeholderTextColor="#6A7A96"
                value={analistaFilters.remito}
                autoCapitalize="characters"
                onChangeText={(text) =>
                  setAnalistaFilters((prev) => ({ ...prev, remito: text }))
                }
                onSubmitEditing={applyAnalistaFiltersToServer}
                returnKeyType="search"
              />
            </View>

            <View style={styles.filterActionsRow}>
              <Text style={styles.filterResultCount}>
                {isLoadingRoutes
                  ? 'Buscando...'
                  : `${rutasVisibles.length} HR${rutasVisibles.length === 1 ? '' : 's'}`}
                {hasActiveAnalistaFilters && !USE_SERVER_ANALISTA_FILTERS
                  ? ' (filtro local)'
                  : ''}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {USE_SERVER_ANALISTA_FILTERS ? (
                  <Pressable onPress={applyAnalistaFiltersToServer} style={styles.filterClearButton}>
                    <Ionicons name="search-outline" size={15} color="#A0C4FF" />
                    <Text style={[styles.filterClearButtonText, { color: '#A0C4FF' }]}>Buscar</Text>
                  </Pressable>
                ) : null}
                {hasActiveAnalistaFilters ? (
                  <Pressable onPress={clearAnalistaFilters} style={styles.filterClearButton}>
                    <Ionicons name="close-circle-outline" size={15} color="#E8A0A0" />
                    <Text style={styles.filterClearButtonText}>Limpiar</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        )}

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>
            {isLoadingRoutes ? 'Cargando hojas de ruta...' : 'Hojas de ruta'}
          </Text>

          {rutasVisibles.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                {isLoadingRoutes
                  ? 'Obteniendo rutas...'
                  : hasActiveAnalistaFilters
                    ? 'Sin resultados para los filtros aplicados'
                    : 'Sin hojas de ruta asignadas'}
              </Text>
            </View>
          ) : (
            rutasVisibles.map((ruta, index) => {
              const rutaObj = typeof ruta === 'object' && ruta !== null ? (ruta as Record<string, unknown>) : {};
              const hruta_d = String(rutaObj.hruta_d || `Hoja ${index + 1}`);
              const fecha = String(rutaObj.fecha || 'Sin fecha');
              const fechaFormateada = fecha !== 'Sin fecha' ? formateoFecha(fecha) : 'Sin fecha';
              const tractor = String(rutaObj.tractor || '-').trim();
              const estado = String(rutaObj.estado || '-').trim();
              const chofer = String(rutaObj.cod_chof || '-').trim();
              const detalles = (Array.isArray(rutaObj.detalles) ? rutaObj.detalles as Record<string, unknown>[] : [])
                .slice()
                .sort((a, b) => parseInt(String(a.item || '0'), 10) - parseInt(String(b.item || '0'), 10));
              const todosConfirmados = detalles.length > 0 && detalles.every(d => Boolean(d.confirmado));

              return (
                <View key={`ruta-${index}`} style={[styles.routeCard, todosConfirmados ? styles.routeCardConfirmado : styles.routeCardPendiente]}>
                  <Pressable
                    style={styles.routeCardHeader}
                    onPress={() => {
                      setExpandedCards(prev => {
                        const next = new Set(prev);
                        if (next.has(index)) { next.delete(index); } else { next.add(index); }
                        return next;
                      });
                    }}
                  >
                    <View style={styles.routeCardHeaderLeft}>
                      <View style={styles.routeCardTitleRow}>
                        <Text style={styles.routeCardTitle}>HR #{hruta_d}</Text>
                        <View style={styles.routeCardDateRow}>
                          <Ionicons name="calendar-outline" size={15} color="#926FA9" />
                          <Text style={styles.routeCardDate}>{fechaFormateada}</Text>
                        </View>
                      </View>
                      <View style={styles.routeCardInfoRow}>
                        <View style={styles.routeCardInfoGroup}>
                          <Ionicons name="bus-outline" size={16} color="#6A8AAC" />
                          <Text style={styles.routeCardInfoText}>{tractor}</Text>
                        </View>
                        <View style={styles.routeCardInfoGroup}>
                          <Ionicons name="person-outline" size={14} color="#7A8698" />
                          <Text style={styles.routeCardInfoText}>{chofer}</Text>
                          {userRol === 'admin' && choferesConNotificaciones.has(chofer) && (
                            <Ionicons 
                              name={choferesConNotificaciones.get(chofer) ? "notifications" : "notifications-off"} 
                              size={12} 
                              color={choferesConNotificaciones.get(chofer) ? "#4CAF50" : "#F44336"} 
                              style={{ marginLeft: 4 }}
                            />
                          )}
                        </View>
                      </View>
                      <Text style={todosConfirmados ? styles.detalleConfirmadoSi : styles.detalleConfirmadoNo}>
                        {todosConfirmados ? 'Confirmado' : 'Pendiente'}
                      </Text>
                    </View>
                    <Ionicons
                      name={expandedCards.has(index) ? 'chevron-up-outline' : 'chevron-down-outline'}
                      size={18}
                      color="#6A7A96"
                      style={styles.routeCardChevron}
                    />
                  </Pressable>
                  {(todosConfirmados && (userRol === 'admin' || userRol === 'trafico')) && (
                    <Pressable
                      style={styles.verRecorridoButton}
                      onPress={() => handleVerRecorrido(detalles)}
                    >
                      <Ionicons name="map-outline" size={14} color="#A0C4FF" />
                      <Text style={styles.verRecorridoText}>Ver recorrido completo</Text>
                    </Pressable>
                  )}
                  {detalles.length > 0 && expandedCards.has(index) && (
                    <View style={styles.detallesBlock}>
                      {detalles.map((det, dIndex) => {
                        const cliente = String(det.cliente || 'Cliente').trim();
                        const direccion = String(det.direccion || '').trim();
                        const codPostal = String(det.cod_postal || '').trim();
                        const empresa = String(det.empresa || '').trim();
                        const empresaNombre = String(det.empresa_nombre || '').trim();
                        const localidadNombre = String(det.localidad_nombre || '').trim();
                        const tdoc = String(det.tdoc || '').trim();
                        const letra = String(det.letra || '').trim();
                        const sucur = String(det.sucur || '').trim();
                        const numero = String(det.numero || '').trim();
                        const confirmado = Boolean(det.confirmado);
                        const detalleKey = `${index}-${dIndex}`;
                        const telefono = String(det.telefono || '').trim();
                        const isDetalleExpanded = expandedDetalles.has(detalleKey);
                        return (
                          <View key={`det-${index}-${dIndex}`} style={styles.detalleItem}>
                            <View style={styles.detalleItemLeft}>
                              <View style={styles.detalleConnector} />
                              <View style={styles.detalleDot} />
                            </View>
                            <View style={styles.detalleContent}>
                              <Pressable
                                style={styles.detalleHeader}
                                onPress={() => {
                                  setExpandedDetalles(prev => {
                                    const next = new Set(prev);
                                    if (next.has(detalleKey)) { next.delete(detalleKey); } else { next.add(detalleKey); }
                                    return next;
                                  });
                                }}
                              >
                                <View style={styles.detalleHeaderLeft}>
                                  <Text style={styles.detalleRemitoCodigo}>{letra}-{sucur}-{numero}</Text>
                                  <Text style={styles.detalleCliente}>{cliente}</Text>
                                  {!isDetalleExpanded && (
                                    <Text style={styles.detalleVerDetalle}>Ver detalles</Text>
                                  )}
                                </View>
                                <Ionicons
                                  name={isDetalleExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                                  size={14}
                                  color="#6A7A96"
                                />
                              </Pressable>

                              {isDetalleExpanded && (
                                <>
                                  <View style={styles.detalleDireccionRow}>
                                    <Text style={[styles.detalleDireccion, styles.detalleDireccionFlex]}>{direccion}</Text>
                                  </View>
                                    {codPostal ?
                                    <View style={styles.detalleDireccionRow}> 
                                        <Text style={styles.detalleCodPostalInline}>CP {codPostal}</Text>
                                    </View> : null
                                    }
                                  {localidadNombre ? <Text style={styles.detalleMetaHalf}>{localidadNombre}</Text> : null}
                                  {empresaNombre ? <Text style={styles.detalleMetaHalf}>{empresaNombre}</Text> : null}
                                  {telefono ? (
                                    <View style={styles.detalleTelefonoRow}>
                                      <Ionicons name="call-outline" size={13} color="#4A90E2" style={{ marginRight: 5 }} />
                                      <Text style={styles.detalleTelefonoText}>{telefono}</Text>
                                    </View>
                                   ) : null 
                                  }
                                </>
                              )}
                              {
                                det.img_estado == 1 && (
                                  <View style={styles.imagenEstadoWrap}>
                                    <View style={styles.imagenEstadoRow}>
                                      <Ionicons name="checkmark-circle-outline" size={13} color="#4BB543" style={{ marginRight: 5 }} />
                                      <Text style={styles.imagenEstadoText}>Imagen cargada</Text>
                                    </View>
                                    {(userRol === 'admin' || userRol === 'analista' || userRol === 'chofer' || userRol === 'trafico') && resolveImagenUrl(det) ? (
                                      <Pressable
                                        style={styles.verImagenButton}
                                        onPress={() => openImagenPreview(det, `${letra}-${sucur}-${numero}`)}
                                      >
                                        <Ionicons name="eye-outline" size={13} color="#A0C4FF" />
                                        <Text style={styles.verImagenButtonText}>Ver imagen</Text>
                                      </Pressable>
                                    ) : null}
                                  </View>
                                )
                              }
                              {confirmado ? (
                                <View style={styles.actionButtonsRow}>
                                  <Pressable
                                    onPress={() => handleUndoConfirmation(hruta_d, cliente, empresa, tdoc, letra, sucur, numero, fecha)}
                                    style={styles.undoConfirmButton}>
                                    <Ionicons name="close-circle-outline" size={13} color="#F9E8E8" />
                                    <Text style={styles.undoConfirmButtonText}>Anular confirmacion</Text>
                                  </Pressable>
                                  <Pressable
                                    onPress={() => uploadingKey === null && handleTakePhoto(empresa, tdoc, letra, sucur, numero)}
                                    style={styles.cameraButton}
                                    disabled={uploadingKey !== null && uploadingKey === `${empresa}-${letra}-${sucur}-${numero}`}>
                                    {uploadingKey === `${empresa}-${letra}-${sucur}-${numero}` ? (
                                      <ActivityIndicator size="small" color="#C8D0F0" />
                                    ) : (
                                      <Ionicons name="camera-outline" size={15} color="#C8D0F0" />
                                    )}
                                  </Pressable>
                                  {/* Botón Consultar al chofer - También disponible en remitos confirmados */}
                                  {(userRol === 'admin' || userRol === 'trafico' || userRol === 'analista') && (
                                    <Pressable
                                      onPress={() => handleConsultarChofer(chofer, cliente, letra, sucur, numero)}
                                      style={styles.consultarButton}>
                                      <Ionicons name="chatbubble-ellipses-outline" size={13} color="#DCE2F1" />
                                      <Text style={styles.consultarButtonText}>Consultar</Text>
                                      {userRol === 'admin' && choferesConNotificaciones.has(chofer) && (
                                        <Ionicons 
                                          name={choferesConNotificaciones.get(chofer) ? "notifications" : "notifications-off"} 
                                          size={11} 
                                          color={choferesConNotificaciones.get(chofer) ? "#4CAF50" : "#F44336"} 
                                          style={{ marginLeft: 4 }}
                                        />
                                      )}
                                    </Pressable>
                                  )}
                                </View>
                              ) : (
                                <View style={styles.actionButtonsRow}>
                                  <Pressable
                                    onPress={() => handleConfirmDelivery(hruta_d, cliente, empresa, tdoc, letra, sucur, numero, fecha)}
                                    style={styles.confirmButton}>
                                    <Ionicons name="checkmark-circle-outline" size={13} color="#F2F5FB" />
                                    <Text style={styles.confirmButtonText}>Confirmar</Text>
                                  </Pressable>
                                  <Pressable
                                    onPress={() => handleRejectDelivery(hruta_d, cliente, empresa, tdoc, letra, sucur, numero, fecha)}
                                    style={styles.rejectButton}>
                                    <Ionicons name="close-circle-outline" size={13} color="#F9E8E8" />
                                    <Text style={styles.rejectButtonText}>Rechazar</Text>
                                  </Pressable>
                                  <Pressable
                                    onPress={() => handlePartialDelivery(hruta_d, cliente, empresa, tdoc, letra, sucur, numero, fecha)}
                                    style={styles.partialButton}>
                                    <Ionicons name="git-branch-outline" size={13} color="#F2E8FF" />
                                    <Text style={styles.partialButtonText}>Parcial</Text>
                                  </Pressable>
                                  {(userRol === 'admin') && (
                                    <Pressable
                                      onPress={() => handleConsultarChofer(chofer, cliente, letra, sucur, numero)}
                                      style={styles.consultarButton}>
                                      <Ionicons name="chatbubble-ellipses-outline" size={13} color="#DCE2F1" />
                                      <Text style={styles.consultarButtonText}>Consultar</Text>
                                      {userRol === 'admin' && choferesConNotificaciones.has(chofer) && (
                                        <Ionicons 
                                          name={choferesConNotificaciones.get(chofer) ? "notifications" : "notifications-off"} 
                                          size={11} 
                                          color={choferesConNotificaciones.get(chofer) ? "#4CAF50" : "#F44336"} 
                                          style={{ marginLeft: 4 }}
                                        />
                                      )}
                                    </Pressable>
                                  )}
                                </View>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <Modal
        transparent={false}
        visible={mapaModal.visible}
        animationType="slide"
        onRequestClose={() => setMapaModal(v => ({ ...v, visible: false }))}
      >
        <View style={styles.mapaModalContainer}>
          <View style={styles.mapaModalHeader}>
            <Text style={styles.mapaModalTitle}>Recorrido de entrega</Text>
            <Pressable
              onPress={() => setMapaModal(v => ({ ...v, visible: false }))}
              style={styles.mapaModalCloseButton}
            >
              <Ionicons name="close" size={22} color="#DCE2F1" />
            </Pressable>
          </View>
          {mapaModal.puntos.length > 0 && (
            <MapView
              style={styles.mapaView}
              initialRegion={{
                latitude: mapaModal.puntos[Math.floor(mapaModal.puntos.length / 2)].latitude,
                longitude: mapaModal.puntos[Math.floor(mapaModal.puntos.length / 2)].longitude,
                latitudeDelta: 0.08,
                longitudeDelta: 0.08,
              }}
              showsUserLocation
              showsMyLocationButton
            >
              {mapaModal.puntos.map((p, i) => (
                <Marker
                  key={`marker-${i}`}
                  coordinate={{ latitude: p.latitude, longitude: p.longitude }}
                  title={`${i + 1}. ${p.label}`}
                  pinColor={i === 0 ? '#4BB543' : i === mapaModal.puntos.length - 1 ? '#E25B5B' : '#4A90E2'}
                />
              ))}
              {mapaModal.puntos.length > 1 && (
                <Polyline
                  coordinates={mapaModal.puntos.map(p => ({ latitude: p.latitude, longitude: p.longitude }))}
                  strokeColor="#4A90E2"
                  strokeWidth={3}
                />
              )}
            </MapView>
          )}
        </View>
      </Modal>

      {/* Modal para Consultar al Chofer */}
      <Modal
        transparent={true}
        visible={consultarModal.visible}
        animationType="fade"
        onRequestClose={() => setConsultarModal(v => ({ ...v, visible: false }))}
      >
        <View style={styles.consultarModalOverlay}>
          <View style={styles.consultarModalContent}>
            <View style={styles.consultarModalHeader}>
              <View style={styles.consultarModalTitleRow}>
                <Ionicons name="chatbubble-ellipses" size={24} color="#4CAF50" />
                <Text style={styles.consultarModalTitle}>Consultar al Chofer</Text>
              </View>
              <Pressable
                onPress={() => setConsultarModal({ visible: false, mensaje: '', chofer: '', cliente: '', remito: '' })}
                style={styles.consultarModalCloseButton}
              >
                <Ionicons name="close" size={22} color="#8A96AC" />
              </Pressable>
            </View>

            <View style={styles.consultarModalBody}>
              <Text style={styles.consultarModalLabel}>Chofer:</Text>
              <Text style={styles.consultarModalValue}>{consultarModal.chofer}</Text>

              <Text style={styles.consultarModalLabel}>Cliente:</Text>
              <Text style={styles.consultarModalValue}>{consultarModal.cliente}</Text>

              <Text style={styles.consultarModalLabel}>Remito:</Text>
              <Text style={styles.consultarModalValue}>{consultarModal.remito}</Text>

              <Text style={styles.consultarModalLabel}>Tu consulta:</Text>
              <TextInput
                style={styles.consultarModalInput}
                placeholder="Escribe tu consulta al chofer..."
                placeholderTextColor="#6A7A96"
                value={consultarModal.mensaje}
                onChangeText={(text) => setConsultarModal(v => ({ ...v, mensaje: text }))}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={500}
              />
              <Text style={styles.consultarModalCharCount}>
                {consultarModal.mensaje.length}/500 caracteres
              </Text>
            </View>

            <View style={styles.consultarModalFooter}>
              <Pressable
                onPress={() => setConsultarModal({ visible: false, mensaje: '', chofer: '', cliente: '', remito: '' })}
                style={[styles.consultarModalButton, styles.consultarModalCancelButton]}
              >
                <Text style={styles.consultarModalCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={enviarConsultaChofer}
                style={[styles.consultarModalButton, styles.consultarModalSendButton]}
                disabled={!consultarModal.mensaje.trim()}
              >
                <Ionicons name="send" size={16} color="#FFF" />
                <Text style={styles.consultarModalSendText}>Enviar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={rechazarModal.visible}
        animationType="fade"
        onRequestClose={() => setRechazarModal(v => ({ ...v, visible: false }))}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Rechazar remito</Text>
            {rechazarModal.params && (
              <Text style={styles.modalMessage}>
                {rechazarModal.params.cliente} — HR #{rechazarModal.params.hruta_d}
              </Text>
            )}
            <Text style={styles.rechazarMotivoLabel}>Seleccioná el motivo del rechazo:</Text>
            <View style={styles.rechazarMotivoList}>
              {isLoadingMotivos ? (
                <ActivityIndicator color="#926FA9" style={{ marginVertical: 12 }} />
              ) : (
                motivosRechazo.map(motivo => {
                  const selected = rechazarModal.selectedMotivo === motivo;
                  return (
                    <Pressable
                      key={motivo}
                      style={[styles.rechazarMotivoItem, selected && styles.rechazarMotivoItemSelected]}
                      onPress={() => setRechazarModal(v => ({ ...v, selectedMotivo: motivo }))}
                    >
                      <View style={[styles.rechazarMotivoRadio, selected && styles.rechazarMotivoRadioSelected]}>
                        {selected && <View style={styles.rechazarMotivoRadioDot} />}
                      </View>
                      <Text style={[styles.rechazarMotivoText, selected && styles.rechazarMotivoTextSelected]}>{motivo}</Text>
                    </Pressable>
                  );
                })
              )}
            </View>
            <View style={styles.modalButtons}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => setRechazarModal(v => ({ ...v, visible: false }))}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.rejectModalConfirmButton, !rechazarModal.selectedMotivo && styles.rejectModalConfirmButtonDisabled]}
                onPress={confirmRechazar}
                disabled={!rechazarModal.selectedMotivo}
              >
                <Ionicons name="close-circle-outline" size={14} color={rechazarModal.selectedMotivo ? '#F1C0C0' : '#7A5A5A'} />
                <Text style={[styles.rejectModalConfirmText, !rechazarModal.selectedMotivo && styles.rejectModalConfirmTextDisabled]}>Rechazar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={validationModal.visible}
        animationType="fade"
        onRequestClose={() => {
          setValidationModal(v => ({ ...v, visible: false }));
          setUploadingKey(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Problema con la validación</Text>
            <Text style={styles.modalMessage}>Hubo un problema al validar la imagen.</Text>
            <View style={styles.modalDetailsBox}>
              <Text style={styles.modalDetailsText}>{validationModal.details}</Text>
            </View>
            <Text style={styles.modalQuestion}>¿Guardar de todos modos?</Text>
            <View style={styles.modalButtons}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => {
                  setValidationModal(v => ({ ...v, visible: false }));
                  setUploadingKey(null);
                }}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={styles.modalConfirmButton}
                onPress={() => {
                  setValidationModal(v => ({ ...v, visible: false }));
                  validationModal.onConfirm();
                }}
              >
                <Text style={styles.modalConfirmText}>Guardar de todos modos</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Loader durante confirmación de entrega */}
      <Modal
        transparent={true}
        visible={imagenModal.visible}
        animationType="fade"
        onRequestClose={() => setImagenModal(v => ({ ...v, visible: false }))}
      >
        <View style={styles.imagenModalOverlay}>
          <View style={styles.imagenModalContent}>
            <View style={styles.imagenModalHeader}>
              <View style={styles.imagenModalTitleWrap}>
                <Ionicons name="image-outline" size={20} color="#A0C4FF" />
                <Text style={styles.imagenModalTitle} numberOfLines={1}>
                  Remito {imagenModal.titulo}
                </Text>
              </View>
              <Pressable
                onPress={() => setImagenModal(v => ({ ...v, visible: false }))}
                style={styles.imagenModalCloseButton}
              >
                <Ionicons name="close" size={22} color="#DCE2F1" />
              </Pressable>
            </View>

            <View style={styles.imagenModalBody}>
              {imagenModal.isPdf ? (
                <View style={styles.imagenModalPdfBox}>
                  <Ionicons name="document-text-outline" size={42} color="#A0C4FF" />
                  <Text style={styles.imagenModalPdfText}>
                    El archivo cargado es un PDF. Podés abrirlo fuera de la app.
                  </Text>
                  <Pressable
                    style={styles.imagenModalOpenButton}
                    onPress={async () => {
                      try {
                        await Linking.openURL(imagenModal.url);
                      } catch {
                        Toast.show({ type: 'error', text1: 'No se pudo abrir el archivo' });
                      }
                    }}
                  >
                    <Ionicons name="open-outline" size={16} color="#F2F5FB" />
                    <Text style={styles.imagenModalOpenButtonText}>Abrir PDF</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  {imagenModal.loading ? (
                    <ActivityIndicator size="large" color="#926FA9" style={styles.imagenModalLoader} />
                  ) : null}
                  {imagenModal.error ? (
                    <View style={styles.imagenModalPdfBox}>
                      <Ionicons name="alert-circle-outline" size={36} color="#E25B5B" />
                      <Text style={styles.imagenModalPdfText}>
                        No se pudo cargar la previsualización.
                      </Text>
                      <Pressable
                        style={styles.imagenModalOpenButton}
                        onPress={async () => {
                          try {
                            await Linking.openURL(imagenModal.url);
                          } catch {
                            Toast.show({ type: 'error', text1: 'No se pudo abrir la imagen' });
                          }
                        }}
                      >
                        <Ionicons name="open-outline" size={16} color="#F2F5FB" />
                        <Text style={styles.imagenModalOpenButtonText}>Abrir en navegador</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Image
                      source={{ uri: imagenModal.url }}
                      style={styles.imagenModalImage}
                      contentFit="contain"
                      onLoadStart={() => setImagenModal(v => ({ ...v, loading: true, error: false }))}
                      onLoad={() => setImagenModal(v => ({ ...v, loading: false, error: false }))}
                      onError={() => setImagenModal(v => ({ ...v, loading: false, error: true }))}
                    />
                  )}
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {isConfirmingDelivery && (
        <View style={styles.loaderOverlay}>
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color="#926FA9" />
            <Text style={styles.loaderText}>Procesando entrega...</Text>
            <Text style={styles.loaderSubtext}>Abriendo cámara al finalizar</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
    imagenEstadoWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 4,
      marginBottom: 2,
    },
    imagenEstadoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(76, 175, 80, 0.08)', // verde suave
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 2,
      alignSelf: 'flex-start',
    },
    imagenEstadoText: {
      color: '#4BB543',
      fontWeight: 'bold',
      fontSize: 13,
      marginLeft: 2,
    },
    verImagenButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: '#3A5080',
      backgroundColor: '#1A2540',
    },
    verImagenButtonText: {
      color: '#A0C4FF',
      fontSize: 12,
      fontWeight: '600',
    },
    imagenModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.82)',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    imagenModalContent: {
      backgroundColor: '#121826',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#2A3847',
      overflow: 'hidden',
      maxHeight: '85%',
    },
    imagenModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: '#1E2D45',
    },
    imagenModalTitleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
      marginRight: 8,
    },
    imagenModalTitle: {
      color: '#E8ECF7',
      fontSize: 15,
      fontWeight: '700',
      flex: 1,
    },
    imagenModalCloseButton: {
      width: 34,
      height: 34,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#1A2540',
    },
    imagenModalBody: {
      minHeight: 280,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 12,
    },
    imagenModalImage: {
      width: '100%',
      height: Dimensions.get('window').height * 0.55,
      borderRadius: 8,
    },
    imagenModalLoader: {
      position: 'absolute',
      zIndex: 2,
    },
    imagenModalPdfBox: {
      alignItems: 'center',
      gap: 12,
      paddingVertical: 24,
      paddingHorizontal: 16,
    },
    imagenModalPdfText: {
      color: '#B0BAD0',
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 20,
    },
    imagenModalOpenButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 6,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: '#3A5080',
    },
    imagenModalOpenButtonText: {
      color: '#F2F5FB',
      fontSize: 14,
      fontWeight: '700',
    },
  safeArea: {
    flex: 1,
    backgroundColor: '#06080D',
    borderWidth: 4,
    borderColor: '#5A414E',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  menuButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#44506A',
    backgroundColor: '#232E44',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  logoBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#D4D7DE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: {
    color: '#171A20',
    fontSize: 24,
    fontWeight: '800',
  },
  headerTextWrap: {
    flex: 1,
    marginLeft: 10,
  },
  headerTitle: {
    color: '#E8ECF7',
    fontSize: 20,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#9AA3B6',
    fontSize: 12,
    marginTop: 2,
  },
  logoutButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#44506A',
    backgroundColor: '#232E44',
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingBlock: {
    marginBottom: 18,
  },
  greetingTitle: {
    color: '#E5E9F5',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  greetingSubtitle: {
    color: '#A3ADBF',
    fontSize: 14,
  },
  sectionBlock: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#44506A',
    backgroundColor: '#151B29',
    borderRadius: 12,
    padding: 14,
  },
  sectionTitle: {
    color: '#DDE3F2',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    color: '#8A96AC',
    fontSize: 14,
    fontStyle: 'italic',
  },
  routeCard: {
    borderWidth: 1,
    borderColor: '#2E3D56',
    backgroundColor: '#101828',
    borderRadius: 12,
    marginBottom: 14,
    overflow: 'hidden',
  },
  routeCardConfirmado: {
    borderColor: '#2E6B42',
    backgroundColor: '#0D1F14',
  },
  routeCardPendiente: {
    borderColor: '#7A2E2E',
    backgroundColor: '#1A0E0E',
  },
  routeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A2540',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  routeCardHeaderLeft: {
    flex: 1,
    gap: 6,
  },
  routeCardChevron: {
    marginLeft: 8,
  },
  routeCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  routeCardTitle: {
    color: '#E8ECF7',
    fontSize: 24,
    fontWeight: '800',
  },
  routeCardDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  routeCardDate: {
    color: '#B0BAD0',
    fontSize: 14,
    fontWeight: '600',
  },
  routeCardInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E2D45',
  },
  routeCardInfoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  routeCardInfoText: {
    color: '#8A96AC',
    fontSize: 12,
  },
  detallesBlock: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  detalleItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  detalleItemLeft: {
    width: 18,
    alignItems: 'center',
    marginTop: 4,
    marginRight: 10,
  },
  detalleConnector: {
    position: 'absolute',
    width: 1,
    top: 8,
    bottom: -12,
    backgroundColor: '#2A3847',
  },
  detalleDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    backgroundColor: '#44506A',
    borderWidth: 1,
    borderColor: '#6A7A96',
  },
  detalleContent: {
    flex: 1,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A2540',
    marginBottom: 4,
  },
  detalleRemitoCodigo: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 3,
    marginTop: 3,
    letterSpacing: 0.5,
  },
  detalleCliente: {
    color: '#D6DFF2',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  detalleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  detalleHeaderLeft: {
    flex: 1,
    marginRight: 6,
  },
  detalleVerDetalle: {
    color: '#5E6E85',
    fontSize: 11,
    marginTop: 1,
  },
  detalleDireccion: {
    color: '#C8D0E0',
    fontSize: 13,
    lineHeight: 18,
  },
  detalleDireccionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  detalleDireccionFlex: {
    flex: 1,
    marginRight: 8,
  },
  detalleCodPostalInline: {
    color: '#B0BBCE',
    fontSize: 13,
  },
  detalleTelefonoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  detalleTelefonoText: {
    color: '#4A90E2',
    fontSize: 13,
  },
  detalleMetaRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  detalleMetaHalf: {
    flex: 1,
    color: '#B0BBCE',
    fontSize: 13,
  },
  detalleMetaSpacer: {
    flex: 1,
  },
  detalleConfirmadoSi: {
    color: '#6FD78C',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '700',
  },
  detalleConfirmadoNo: {
    color: '#E2A35B',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '700',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    justifyContent: 'center', // Centra los botones en el eje X
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#1E4A2E',
    borderWidth: 1,
    borderColor: '#2E6B42',
  },
  rejectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#5A2323',
    borderWidth: 1,
    borderColor: '#8A3A3A',
  },
  rejectButtonText: {
    color: '#F1C0C0',
    fontSize: 11,
    fontWeight: '700',
  },
  partialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#1E2A4A',
    borderWidth: 1,
    borderColor: '#3A5080',
  },
  partialButtonText: {
    color: '#C0D0F5',
    fontSize: 11,
    fontWeight: '700',
  },
  consultarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#2A3550',
    borderWidth: 1,
    borderColor: '#4A5A80',
  },
  consultarButtonText: {
    color: '#A5B4D4',
    fontSize: 11,
    fontWeight: '700',
  },
  confirmButtonText: {
    color: '#A0E0B0',
    fontSize: 11,
    fontWeight: '700',
  },
  cameraButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#1A2040',
    borderWidth: 1,
    borderColor: '#3A4A70',
    marginTop: 0, // Alineación vertical
    marginBottom: 0, // Alineación vertical
    alignSelf: 'center', // Centrado en el eje Y dentro del row
  },
  undoConfirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#5A2323',
    borderWidth: 1,
    borderColor: '#8A3A3A',
    marginTop: 0, // Alineación vertical
    marginBottom: 0, // Alineación vertical
    alignSelf: 'center', // Centrado en el eje Y dentro del row
  },
  undoConfirmButtonText: {
    color: '#F1C0C0',
    fontSize: 11,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#151B29',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#44506A',
    padding: 20,
    width: '100%',
  },
  modalTitle: {
    color: '#E8ECF7',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalMessage: {
    color: '#B0BAD0',
    fontSize: 14,
    marginBottom: 12,
  },
  modalDetailsBox: {
    backgroundColor: '#0D1120',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2E3D56',
    padding: 10,
    marginBottom: 14,
  },
  modalDetailsText: {
    color: '#8A96AC',
    fontSize: 12,
  },
  modalQuestion: {
    color: '#DDE3F2',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  modalCancelButton: {
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1A2540',
    borderWidth: 1,
    borderColor: '#44506A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    color: '#B0BAD0',
    fontSize: 13,
    fontWeight: '600',
  },
  modalConfirmButton: {
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1E4A2E',
    borderWidth: 1,
    borderColor: '#2E6B42',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    color: '#A0E0B0',
    fontSize: 13,
    fontWeight: '600',
  },
  rechazarMotivoLabel: {
    color: '#B0BAD0',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  rechazarMotivoList: {
    gap: 6,
    marginBottom: 16,
  },
  rechazarMotivoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2E3D56',
    backgroundColor: '#0D1120',
  },
  rechazarMotivoItemSelected: {
    borderColor: '#8A3A3A',
    backgroundColor: '#2A1010',
  },
  rechazarMotivoRadio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#44506A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rechazarMotivoRadioSelected: {
    borderColor: '#C05050',
  },
  rechazarMotivoRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C05050',
  },
  rechazarMotivoText: {
    color: '#8A96AC',
    fontSize: 13,
    flex: 1,
  },
  rechazarMotivoTextSelected: {
    color: '#F1C0C0',
    fontWeight: '600',
  },
  rejectModalConfirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#5A2323',
    borderWidth: 1,
    borderColor: '#8A3A3A',
    justifyContent: 'center',
  },
  rejectModalConfirmButtonDisabled: {
    backgroundColor: '#2A1A1A',
    borderColor: '#3A2A2A',
  },
  rejectModalConfirmText: {
    color: '#F1C0C0',
    fontSize: 13,
    fontWeight: '700',
  },
  rejectModalConfirmTextDisabled: {
    color: '#7A5A5A',
  },
  verRecorridoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#0D1E36',
    borderTopWidth: 1,
    borderTopColor: '#1A3050',
  },
  verRecorridoText: {
    color: '#A0C4FF',
    fontSize: 13,
    fontWeight: '600',
  },
  mapaModalContainer: {
    flex: 1,
    backgroundColor: '#06080D',
  },
  mapaModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 12,
    backgroundColor: '#151B29',
    borderBottomWidth: 1,
    borderBottomColor: '#44506A',
  },
  mapaModalTitle: {
    color: '#E8ECF7',
    fontSize: 17,
    fontWeight: '700',
  },
  mapaModalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#232E44',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapaView: {
    flex: 1,
    width: Dimensions.get('window').width,
  },
  datePickerBlock: {
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#151B29',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#44506A',
  },
  datePickerLabel: {
    color: '#B0BAD0',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#1A2540',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3A5080',
  },
  datePickerButtonText: {
    color: '#E8ECF7',
    fontSize: 15,
    fontWeight: '600',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3A5080',
    backgroundColor: '#1A2540',
    marginBottom: 10,
  },
  filterChipActive: {
    backgroundColor: '#4A3A6A',
    borderColor: '#926FA9',
  },
  filterChipText: {
    color: '#A0C4FF',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#F2F5FB',
  },
  filterInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1A2540',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3A5080',
    marginBottom: 8,
  },
  filterInput: {
    flex: 1,
    color: '#E8ECF7',
    fontSize: 14,
    paddingVertical: 4,
  },
  filterActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  filterResultCount: {
    color: '#8A96AC',
    fontSize: 12,
    fontWeight: '500',
  },
  filterClearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  filterClearButtonText: {
    color: '#E8A0A0',
    fontSize: 12,
    fontWeight: '600',
  },
  trackingIndicator: {
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#151B29',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#44506A',
  },
  trackingIndicatorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trackingIndicatorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  trackingIndicatorTitle: {
    color: '#E8ECF7',
    fontSize: 14,
    fontWeight: '600',
  },
  trackingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  trackingDotActive: {
    backgroundColor: '#4BB543',
    shadowColor: '#4BB543',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  trackingDotInactive: {
    backgroundColor: '#5A5A5A',
  },
  trackingToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  trackingToggleButtonActive: {
    backgroundColor: '#1E4A2E',
    borderColor: '#2E6B42',
  },
  trackingToggleButtonInactive: {
    backgroundColor: '#1A2540',
    borderColor: '#3A5080',
  },
  trackingToggleButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  trackingToggleButtonTextActive: {
    color: '#A0E0B0',
  },
  trackingToggleButtonTextInactive: {
    color: '#B0BAD0',
  },
  trackingLastUpdate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2E3D56',
  },
  trackingLastUpdateText: {
    color: '#8A96AC',
    fontSize: 11,
  },
  // Estilos para Modal de Consultar al Chofer
  consultarModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  consultarModalContent: {
    backgroundColor: '#1E2A40',
    borderRadius: 12,
    width: '100%',
    maxWidth: 500,
    borderWidth: 1,
    borderColor: '#2E3D56',
  },
  consultarModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2E3D56',
  },
  consultarModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  consultarModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E8F0FE',
  },
  consultarModalCloseButton: {
    padding: 4,
  },
  consultarModalBody: {
    padding: 16,
  },
  consultarModalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8A96AC',
    marginTop: 12,
    marginBottom: 4,
  },
  consultarModalValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#E8F0FE',
    marginBottom: 8,
  },
  consultarModalInput: {
    backgroundColor: '#0E1929',
    borderWidth: 1,
    borderColor: '#2E3D56',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#E8F0FE',
    minHeight: 100,
    marginTop: 8,
  },
  consultarModalCharCount: {
    fontSize: 11,
    color: '#6A7A96',
    textAlign: 'right',
    marginTop: 4,
  },
  consultarModalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#2E3D56',
  },
  consultarModalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  consultarModalCancelButton: {
    backgroundColor: '#2E3D56',
    borderWidth: 1,
    borderColor: '#3A4A70',
  },
  consultarModalCancelText: {
    color: '#B0BAD0',
    fontSize: 14,
    fontWeight: '600',
  },
  consultarModalSendButton: {
    backgroundColor: '#2E5F4A',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  consultarModalSendText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  // Estilos para Loader de Confirmación
  loaderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  loaderContainer: {
    backgroundColor: '#1E2A40',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2E3D56',
    minWidth: 200,
  },
  loaderText: {
    color: '#E8F0FE',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  loaderSubtext: {
    color: '#8A96AC',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
});
