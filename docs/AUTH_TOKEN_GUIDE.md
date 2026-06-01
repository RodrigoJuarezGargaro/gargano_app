# Guía de Uso - Sistema de Autenticación con Tokens

## 📋 Resumen

A partir de ahora, todos los endpoints de la API requieren autenticación mediante tokens Bearer (Laravel Sanctum).

---

## 🔑 Flujo de Autenticación

### 1. **Login con Token**

**Endpoint:** `/login_token`

**Ejemplo de uso:**
```typescript
import { saveAuthToken } from '@/services/auth-token';

const response = await fetch(API_BASE_URL + 'login_token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  body: JSON.stringify({ 
    login: 'usuario@ejemplo.com', 
    clave: 'contraseña' 
  }),
});

const data = await response.json();

if (data.success && data.token) {
  // Guardar token automáticamente
  await saveAuthToken(data.token);
  
  // Guardar datos del usuario
  await AsyncStorage.setItem('userSession', JSON.stringify(data.user));
}
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "login": "usuario@ejemplo.com",
    "nombre_usuario": "Juan Pérez",
    "id_perfil": "1",
    "perfil_nombre": "Admin",
    ...
  },
  "token": "2|BNqye3Z1GtEErzGrrxWRO1pydVDiwAVmsZnHlePV568e4282"
}
```

---

## 🔐 Uso del Token en Endpoints

### Opción 1: Usando `authenticatedFetch` (Recomendado)

La forma más simple es usar la función `authenticatedFetch` que maneja automáticamente el token:

```typescript
import { authenticatedFetch } from '@/services/auth-token';

// GET request
const response = await authenticatedFetch('obtener_hoja_ruta/chofer123');

// POST request
const response = await authenticatedFetch('guardar_token_notificacion', {
  method: 'POST',
  body: JSON.stringify({
    usuario: 'chofer123',
    token: 'ExponentPushToken[...]'
  }),
});

const data = await response.json();
```

### Opción 2: Usando `getAuthHeaders` (Control Manual)

Si necesitas más control sobre la petición:

```typescript
import { getAuthHeaders } from '@/services/auth-token';

const headers = await getAuthHeaders();

const response = await fetch(API_BASE_URL + 'obtener_hoja_ruta/chofer123', {
  method: 'GET',
  headers: headers,
});

const data = await response.json();
```

### Opción 3: Usando `getAuthToken` (Control Total)

Para casos especiales donde necesites el token directamente:

```typescript
import { getAuthToken } from '@/services/auth-token';

const token = await getAuthToken();

const response = await fetch(API_BASE_URL + 'mi_endpoint', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
});
```

---

## 🚪 Logout y Limpieza de Sesión

El token se limpia automáticamente al llamar a `clearUserSession()`:

```typescript
import { clearUserSession } from '@/services/session-storage';

// Esto limpia tanto la sesión como el token de autenticación
await clearUserSession();
```

---

## 📝 Funciones Disponibles en `auth-token.ts`

| Función | Descripción |
|---------|-------------|
| `saveAuthToken(token)` | Guarda el token en AsyncStorage |
| `getAuthToken()` | Obtiene el token almacenado |
| `clearAuthToken()` | Elimina el token (usado en logout) |
| `hasAuthToken()` | Verifica si existe un token válido |
| `getAuthHeaders(additionalHeaders?)` | Retorna headers con Authorization Bearer |
| `authenticatedFetch(endpoint, options?)` | Fetch con autenticación automática |

---

## ⚡ Migración de Endpoints Existentes

### Antes:
```typescript
const response = await fetch(API_BASE_URL + 'obtener_hoja_ruta/chofer123', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});
```

### Después:
```typescript
import { authenticatedFetch } from '@/services/auth-token';

const response = await authenticatedFetch('obtener_hoja_ruta/chofer123');
```

---

## 🔍 Ejemplo Completo

```typescript
import { authenticatedFetch } from '@/services/auth-token';
import AsyncStorage from '@react-native-async-storage/async-storage';

const cargarHojaRuta = async () => {
  try {
    const usuario = await AsyncStorage.getItem('nombre_usuario');
    
    // Petición autenticada automáticamente
    const response = await authenticatedFetch(`obtener_hoja_ruta/${usuario}`);
    
    if (!response.ok) {
      throw new Error(`Error ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Hoja de ruta:', data);
    
  } catch (error) {
    console.error('Error cargando hoja de ruta:', error);
  }
};
```

---

## ⚠️ Notas Importantes

1. **El token se guarda automáticamente** al hacer login exitoso
2. **El token se incluye automáticamente** en todas las peticiones con `authenticatedFetch`
3. **El token se limpia automáticamente** al hacer logout con `clearUserSession()`
4. **No necesitas manejar el token manualmente** en la mayoría de los casos
5. **Usa `authenticatedFetch`** para simplificar tu código

---

## 🛠️ Archivos Modificados

- ✅ `services/auth-token.ts` - Nuevo servicio de gestión de tokens
- ✅ `services/session-storage.ts` - Actualizado para limpiar tokens en logout
- ✅ `app/(tabs)/index.tsx` - Login actualizado a `/login_token` con guardado de token
