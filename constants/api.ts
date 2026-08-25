/** Base del backend Laravel (sin proxy). */
export const API_BASE_URL =
  'https://www.gargano.com.ar/laravel_backend_app/public/api/';

/** Arma una URL de API: `apiUrl('login_token')` o con query params. */
export function apiUrl(
  endpoint: string,
  query?: Record<string, string | number | boolean | undefined | null>,
): string {
  const path = endpoint.replace(/^\//, '');
  const url = `${API_BASE_URL}${path}`;
  if (!query) return url;

  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}
