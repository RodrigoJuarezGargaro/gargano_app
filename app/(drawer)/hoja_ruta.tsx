import { clearUserSession } from '@/services/session-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

const API_RESPONSE_TIMEOUT_MS = 120000;

export default function HojaRutaScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [userName, setUserName] = useState('Usuario');
  const [hojaRuta, setHojaRuta] = useState<unknown[]>([]);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [expandedDetalles, setExpandedDetalles] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadSession = async () => {
      const session = await AsyncStorage.getItem('userSession');
      console.log('Cargando sesión de usuario...', { session });
      if (!session) {
        router.replace('/');
        return;
      }

      const sessionData = JSON.parse(session);

      let displayName = 'Usuario';
      if (sessionData.nombre_usuario) {
        setUserName(sessionData.nombre_usuario);
        displayName = sessionData.nombre;
      } else if (sessionData.login) {
        setUserName(sessionData.login);
        displayName = sessionData.login;
      }

      await fetchHojaRuta(displayName);
    };

    loadSession();
  }, [router]);

  const fetchHojaRuta = async (nombre: string) => {
    setIsLoadingRoutes(true);
    try {
      const cleanName = nombre.trim();
      if (!cleanName) {
        console.warn('Nombre vacío, no se puede buscar hoja de ruta');
        setIsLoadingRoutes(false);
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_RESPONSE_TIMEOUT_MS);
      let response: Response;

      try {
        response = await fetch(
          `https://gargano-proxy.vercel.app/api/proxy?endpoint=obtener_hoja_ruta/${encodeURIComponent(cleanName)}`,
          { signal: controller.signal }
        );
      } finally {
        clearTimeout(timeoutId);
      }

      console.log('Hoja de ruta response status:', response.status);

      if (!response.ok) {
        Toast.show({ type: 'error', text1: 'Error al obtener hoja de ruta. Intenta nuevamente más tarde.' });
        console.error('Error fetching hoja de ruta:', response.status);
        setIsLoadingRoutes(false);
        return;
      }

      const data = await response.json();
      const routes = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      setHojaRuta(routes);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('Hoja de ruta timeout: el backend tardo mas de 120 segundos en responder.');
        return;
      }

      console.error('Error fetching hoja de ruta:', error);
    } finally {
      setIsLoadingRoutes(false);
    }
  };

  const handleLogout = async () => {
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
      'Confirmar entrega',
      `¿Confirmar entrega a ${cliente}?\nHoja de ruta: ${hruta_d}`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Confirmar',
          onPress: async () => {
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
                  Toast.show({ type: 'error', text1: insertarData?.error ? JSON.stringify(insertarData.error) : 'No se pudo insertar el remito.' });
                  return;
                }

                if (!insertarData?.insertado) {
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
                  Toast.show({ type: 'error', text1: actualizarData?.error ? JSON.stringify(actualizarData.error) : 'No se pudo actualizar el remito.' });
                  return;
                }

                if (!actualizarData?.actualizado) {
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
                Toast.show({ type: 'error', text1: guardarFechaData?.error ? JSON.stringify(guardarFechaData.error) : 'No se pudo guardar la fecha de entrega.' });
                return;
              }

              if (guardarFechaData?.actualizado) {
                updateDetalleOptimistically(empresa, tdoc, letra, sucursal, numero, true);
                Toast.show({ type: 'success', text1: 'Entrega confirmada y fecha guardada correctamente.' });
                await fetchHojaRuta(userName);
              } else {
                Toast.show({ type: 'error', text1: 'No se pudo guardar la fecha de entrega.' });
              }
            } catch (error) {
              console.error('Error confirmando entrega:', error);
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
              console.log({
                empresa,
                tdoc,
                letra,
                sucursal,
                numero,
                usuario: userName,
              });

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
                await fetchHojaRuta(userName);
              } else {
                Toast.show({ type: 'error', text1: 'No se pudo anular el remito.' });
              }
            } catch (error) {
              console.error('Error anulando entrega:', error);
              Toast.show({ type: 'error', text1: 'No se pudo conectar con el servidor.' });
            }
          },
        },
      ]
    );
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
    Alert.alert(
      'Rechazar remito',
      `¿Rechazar el remito de ${cliente}?\nHoja de ruta: ${hruta_d}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Rechazar',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log({
                empresa,
                tdoc,
                letra,
                sucursal,
                numero,
                usuario: userName,
                hruta_d: parseInt(hruta_d, 10),
                fecha,
              })
              const rechazarResponse = await fetch(
                'https://gargano-proxy.vercel.app/api/proxy?endpoint=rechazar_remito_app',
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
              const rechazarData = await rechazarResponse.json();
              console.log('Rechazar remito response:', rechazarData);
              if (!rechazarResponse.ok) {
                Toast.show({ type: 'error', text1: rechazarData?.error ? JSON.stringify(rechazarData.error) : 'No se pudo rechazar el remito.' });
                return;
              }
              if (rechazarData?.rechazado) {
                updateDetalleOptimistically(empresa, tdoc, letra, sucursal, numero, true);
                Toast.show({ type: 'success', text1: 'Remito rechazado correctamente.' });
                await fetchHojaRuta(userName);
              } else {
                Toast.show({ type: 'error', text1: 'No se pudo rechazar el remito.' });
              }
            } catch (error) {
              console.error('Error rechazando remito:', error);
              Toast.show({ type: 'error', text1: 'No se pudo conectar con el servidor.' });
            }
          },
        },
      ]
    );
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
            try {
              console.log({
                empresa,
                tdoc,
                letra,
                sucursal,
                numero,
                usuario: userName,
                hruta_d: parseInt(hruta_d, 10),
                fecha,
              })
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
                await fetchHojaRuta(userName);
              } else {
                Toast.show({ type: 'error', text1: 'No se pudo registrar la entrega parcial.' });
              }
            } catch (error) {
              console.error('Error registrando entrega parcial:', error);
              Toast.show({ type: 'error', text1: 'No se pudo conectar con el servidor.' });
            }
          },
        },
      ]
    );
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
          <Text style={styles.greetingTitle}>Hola, {userName}</Text>
        </View>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>
            {isLoadingRoutes ? 'Cargando hojas de ruta...' : 'Hojas de ruta'}
          </Text>

          {hojaRuta.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                {isLoadingRoutes ? 'Obteniendo rutas...' : 'Sin hojas de ruta asignadas'}
              </Text>
            </View>
          ) : (
            hojaRuta.map((ruta, index) => {
              const rutaObj = typeof ruta === 'object' && ruta !== null ? (ruta as Record<string, unknown>) : {};
              const hruta_d = String(rutaObj.hruta_d || `Hoja ${index + 1}`);
              const fecha = String(rutaObj.fecha || 'Sin fecha');
              const tractor = String(rutaObj.tractor || '-').trim();
              const estado = String(rutaObj.estado || '-').trim();
              const chofer = String(rutaObj.cod_chof || '-').trim();
              const detalles = Array.isArray(rutaObj.detalles) ? rutaObj.detalles as Record<string, unknown>[] : [];
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
                          <Text style={styles.routeCardDate}>{fecha}</Text>
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

                  {detalles.length > 0 && expandedCards.has(index) && (
                    <View style={styles.detallesBlock}>
                      {detalles.map((det, dIndex) => {
                        const cliente = String(det.cliente || 'Cliente').trim();
                        const direccion = String(det.direccion || '').trim();
                        const codPostal = String(det.cod_postal || '').trim();
                        const empresa = String(det.empresa || '').trim();
                        const tdoc = String(det.tdoc || '').trim();
                        const letra = String(det.letra || '').trim();
                        const sucur = String(det.sucur || '').trim();
                        const numero = String(det.numero || '').trim();
                        const confirmado = Boolean(det.confirmado);
                        const detalleKey = `${index}-${dIndex}`;
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
                                    {codPostal ? <Text style={styles.detalleCodPostalInline}>CP {codPostal}</Text> : null}
                                  </View>
                                  {empresa ? <Text style={styles.detalleMetaHalf}>Empresa {empresa}</Text> : null}
                                  {(tdoc || letra) ? (
                                    <View style={styles.detalleMetaRow}>
                                      {tdoc ? <Text style={styles.detalleMetaHalf}>Tipo Documento {tdoc}</Text> : <View style={styles.detalleMetaSpacer} />}
                                      {letra ? <Text style={styles.detalleMetaHalf}>Letra {letra}</Text> : <View style={styles.detalleMetaSpacer} />}
                                    </View>
                                  ) : null}
                                  {(sucur || numero) ? (
                                    <View style={styles.detalleMetaRow}>
                                      {sucur ? <Text style={styles.detalleMetaHalf}>Sucursal {sucur}</Text> : <View style={styles.detalleMetaSpacer} />}
                                      {numero ? <Text style={styles.detalleMetaHalf}>Número {numero}</Text> : <View style={styles.detalleMetaSpacer} />}
                                    </View>
                                  ) : null}
                                </>
                              )}

                              {confirmado ? (
                                <Pressable
                                  onPress={() => handleUndoConfirmation(hruta_d, cliente, empresa, tdoc, letra, sucur, numero, fecha)}
                                  style={styles.undoConfirmButton}>
                                  <Ionicons name="close-circle-outline" size={13} color="#F9E8E8" />
                                  <Text style={styles.undoConfirmButtonText}>Anular confirmacion</Text>
                                </Pressable>
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
    fontSize: 30,
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
    fontSize: 18,
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
  detalleCliente: {
    color: '#D6DFF2',
    fontSize: 13,
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
  confirmButtonText: {
    color: '#A0E0B0',
    fontSize: 11,
    fontWeight: '700',
  },
  undoConfirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#5A2323',
    borderWidth: 1,
    borderColor: '#8A3A3A',
    marginTop: 8,
  },
  undoConfirmButtonText: {
    color: '#F1C0C0',
    fontSize: 11,
    fontWeight: '700',
  },
});
