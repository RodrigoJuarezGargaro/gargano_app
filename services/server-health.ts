/**
 * Servicio para verificar el estado del servidor
 * Utiliza el endpoint de health check para detectar si el servidor está caído
 */

const API_BASE_URL = 'https://gargano-proxy.vercel.app/api/proxy?endpoint=';
const HEALTH_CHECK_TIMEOUT = 10000; // 10 segundos de timeout

export interface ServerHealthStatus {
  isOnline: boolean;
  message: string;
  statusCode?: number;
  raw?: unknown;
  latencyMs?: number;
  checkedAt: string;
}

/**
 * Verifica si el servidor está disponible mediante el endpoint de health
 * @returns {Promise<ServerHealthStatus>} Estado del servidor
 */
export async function checkServerHealth(): Promise<ServerHealthStatus> {
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

    const response = await fetch(API_BASE_URL + 'health', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startedAt;

    let raw: unknown = null;
    try {
      raw = await response.json();
    } catch {
      raw = null;
    }

    if (response.ok) {
      const messageFromApi =
        raw && typeof raw === 'object' && raw !== null && 'message' in raw
          ? String((raw as { message?: unknown }).message ?? '')
          : '';

      return {
        isOnline: true,
        message: messageFromApi || 'Servidor operativo',
        statusCode: response.status,
        raw,
        latencyMs,
        checkedAt,
      };
    }

    return {
      isOnline: false,
      message: 'El servidor está experimentando problemas',
      statusCode: response.status,
      raw,
      latencyMs,
      checkedAt,
    };
  } catch (error) {
    console.error('[ServerHealth] Error verificando estado del servidor:', error);
    
    if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('Network'))) {
      return {
        isOnline: false,
        message: 'No se pudo conectar con el servidor',
        latencyMs: Date.now() - startedAt,
        checkedAt,
      };
    }

    return {
      isOnline: false,
      message: 'Error al verificar el estado del servidor',
      latencyMs: Date.now() - startedAt,
      checkedAt,
    };
  }
}

/**
 * Verifica si un error de fetch es causado por un servidor caído
 * Útil para validar antes de mostrar mensajes de error específicos
 */
export async function isServerDown(): Promise<boolean> {
  const healthStatus = await checkServerHealth();
  return !healthStatus.isOnline;
}
