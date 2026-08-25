module.exports = {
  expo: {
    name: "Gargano Logistica",
    slug: "gargano-logistica",
    version: "1.0.7",
    orientation: "portrait",
    icon: "./assets/images/new_icon.png",
    scheme: "garganomobile",
    userInterfaceStyle: "automatic",
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.rjuarezsorganization.garganologistica",
      usesGoogleMaps: true, 
      config: {
        googleMapsApiKey: "AIzaSyB17fwcFaFxrxz_tTpnnjMA7IlzLYmsJzM"
      },
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSFaceIDUsageDescription: "Gargano Logística usa Face ID para que puedas ingresar de forma rápida y segura.",
        UIBackgroundModes: ["location", "fetch"]
      }
    },
    android: {
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON || "./google-services.json",
      adaptiveIcon: {
        backgroundColor: "#673E8A",
        foregroundImage: "./assets/images/new_icon.png",
        backgroundImage: "./assets/images/new_icon.png",
        monochromeImage: "./assets/images/new_icon.png"
      },
      predictiveBackGestureEnabled: false,
      package: "com.rjuarezsorganization.garganologistica",
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION",
        "USE_BIOMETRIC",
        "USE_FINGERPRINT"
      ],
      config: {
        googleMaps: {
          apiKey: "AIzaSyB17fwcFaFxrxz_tTpnnjMA7IlzLYmsJzM"
        }
      }
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    splash: {
      image: "./assets/images/new_icon.png",
      resizeMode: "contain",
      backgroundColor: "#673E8A"
    },
    plugins: [
      "expo-router",
      "expo-notifications",
      "expo-secure-store",
      [
        "expo-local-authentication",
        {
          // Solo aplica en iOS. Android no tiene Face ID ni este permiso de sistema.
          faceIDPermission: "Gargano Logística usa Face ID para que puedas ingresar de forma rápida y segura."
        }
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "La app accede a tus fotos para registrar eventualidades.",
          cameraPermission: "La app usa la cámara para registrar eventualidades en las entregas."
        }
      ],
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission: "La app usa tu ubicación para registrar la posición de las entregas y rastrear el recorrido del chofer.",
          locationWhenInUsePermission: "La app usa tu ubicación para registrar la posición de las entregas.",
          isIosBackgroundLocationEnabled: true,
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true
        }
      ],
      "react-native-maps",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#673E8A",
          dark: {
            backgroundColor: "#673E8A"
          }
        }
      ],
      "expo-web-browser",
      "@react-native-community/datetimepicker",
      "./plugins/withAndroidBackgroundLocation.js"
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true
    },
    extra: {
      router: {},
      eas: {
        projectId: "fb941144-6082-4e3b-9fbf-7b3aeaa7149a"
      }
    },
    owner: "rjuarezs-organization"
  }
};
