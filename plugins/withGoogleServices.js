const { withDangerousMod, withPlugins } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Config plugin to generate google-services.json from environment variables
 * This runs during prebuild, before expo looks for the file
 */
const withGoogleServices = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const googleServicesJson = process.env.GOOGLE_SERVICES_JSON;
      
      if (!googleServicesJson) {
        console.warn('⚠️  GOOGLE_SERVICES_JSON environment variable is not set');
        return config;
      }

      console.log('▸ Generating google-services.json from environment variable...');

      let content = googleServicesJson;
      
      // Decode from base64 if needed (EAS secrets are base64 encoded)
      try {
        if (!content.trim().startsWith('{')) {
          console.log('  Decoding from base64...');
          content = Buffer.from(content, 'base64').toString('utf-8');
        }
        
        // Validate JSON
        JSON.parse(content);
        
        // Write to project root
        const projectRoot = config.modRequest.projectRoot;
        const googleServicesPath = path.join(projectRoot, 'google-services.json');
        fs.writeFileSync(googleServicesPath, content);
        
        console.log(`✓ google-services.json created at ${googleServicesPath}`);
        console.log(`  File size: ${Buffer.byteLength(content)} bytes`);
        
      } catch (error) {
        console.error('✖ Error processing GOOGLE_SERVICES_JSON:', error.message);
        throw error;
      }

      return config;
    },
  ]);
};

/**
 * Config plugin to generate Firebase Admin SDK JSON from environment variables
 */
const withFirebaseAdminSdk = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const firebaseAdminJson = process.env.FIREBASE_ADMIN_SDK_JSON;
      
      if (!firebaseAdminJson) {
        console.log('ℹ️  FIREBASE_ADMIN_SDK_JSON not set (optional)');
        return config;
      }

      console.log('▸ Generating Firebase Admin SDK JSON from environment variable...');

      let content = firebaseAdminJson;
      
      try {
        if (!content.trim().startsWith('{')) {
          console.log('  Decoding from base64...');
          content = Buffer.from(content, 'base64').toString('utf-8');
        }
        
        JSON.parse(content);
        
        const projectRoot = config.modRequest.projectRoot;
        const adminSdkPath = path.join(projectRoot, 'garganomobile-firebase-adminsdk-fbsvc-4846acb8bf.json');
        fs.writeFileSync(adminSdkPath, content);
        
        console.log(`✓ Firebase Admin SDK JSON created at ${adminSdkPath}`);
        
      } catch (error) {
        console.warn('⚠️  Error processing FIREBASE_ADMIN_SDK_JSON:', error.message);
      }

      return config;
    },
  ]);
};

module.exports = (config) => {
  return withPlugins(config, [withGoogleServices, withFirebaseAdminSdk]);
};
