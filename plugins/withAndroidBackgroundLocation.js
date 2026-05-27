const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Plugin para configurar el foreground service de ubicación en Android
 * Esto evita que Android mate el proceso en background
 */
const withAndroidBackgroundLocation = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults.manifest;

    // Asegurar que exista el array de permisos
    if (!androidManifest['uses-permission']) {
      androidManifest['uses-permission'] = [];
    }

    // Agregar permisos adicionales para background location
    const permissions = [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.WAKE_LOCK', // Evita que el dispositivo duerma
      'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', // Permite solicitar exención de optimización de batería
    ];

    permissions.forEach((permission) => {
      if (!androidManifest['uses-permission'].find(p => p.$['android:name'] === permission)) {
        androidManifest['uses-permission'].push({
          $: { 'android:name': permission },
        });
      }
    });

    // Configurar el servicio en background
    const application = androidManifest.application[0];

    // Agregar configuración de servicio si no existe
    if (!application.service) {
      application.service = [];
    }

    // Asegurar que el servicio de Expo Location tenga la configuración correcta
    const locationServiceIndex = application.service.findIndex(
      s => s.$['android:name'] === 'expo.modules.location.LocationTaskService'
    );

    const locationServiceConfig = {
      $: {
        'android:name': 'expo.modules.location.LocationTaskService',
        'android:exported': 'false',
        'android:foregroundServiceType': 'location',
        'android:stopWithTask': 'false', // NO detener cuando se cierra la app
      },
    };

    if (locationServiceIndex >= 0) {
      // Actualizar servicio existente
      application.service[locationServiceIndex] = locationServiceConfig;
    } else {
      // Agregar nuevo servicio
      application.service.push(locationServiceConfig);
    }

    return config;
  });
};

module.exports = withAndroidBackgroundLocation;
