#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('▸ Setting up Firebase configuration files...');

// Check if running in EAS build environment
const isEasBuild = process.env.EAS_BUILD_WORKDIR;
const workDir = isEasBuild || process.cwd();

console.log(`▸ Working directory: ${workDir}`);
console.log(`▸ Is EAS Build: ${isEasBuild ? 'Yes' : 'No'}`);

// Helper function to decode base64 if needed
function decodeContent(content) {
  // Check if content is base64 encoded
  try {
    // If it starts with { it's probably already JSON
    if (content.trim().startsWith('{')) {
      return content;
    }
    // Try to decode from base64
    const decoded = Buffer.from(content, 'base64').toString('utf-8');
    // Verify it's valid JSON
    JSON.parse(decoded);
    console.log('  Decoded from base64');
    return decoded;
  } catch (error) {
    // If decoding fails, assume it's already plain text
    console.log('  Using content as-is');
    return content;
  }
}

// Setup google-services.json
if (process.env.GOOGLE_SERVICES_JSON) {
  const googleServicesPath = path.join(workDir, 'google-services.json');
  console.log('▸ GOOGLE_SERVICES_JSON found, creating file...');
  
  try {
    const content = decodeContent(process.env.GOOGLE_SERVICES_JSON);
    fs.writeFileSync(googleServicesPath, content);
    console.log('✓ google-services.json created successfully');
    
    // Verify the file was created
    if (fs.existsSync(googleServicesPath)) {
      const stats = fs.statSync(googleServicesPath);
      console.log(`  File size: ${stats.size} bytes`);
    }
  } catch (error) {
    console.error('✖ Error creating google-services.json:', error.message);
    process.exit(1);
  }
} else {
  console.error('✖ GOOGLE_SERVICES_JSON environment variable not found');
  if (isEasBuild) {
    console.error('  Please configure the secret with: eas secret:create --scope project --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json');
    process.exit(1);
  } else {
    console.log('ℹ Not in EAS build, skipping...');
  }
}

// Setup Firebase Admin SDK JSON (optional)
if (process.env.FIREBASE_ADMIN_SDK_JSON) {
  const adminSdkPath = path.join(workDir, 'garganomobile-firebase-adminsdk-fbsvc-4846acb8bf.json');
  console.log('▸ FIREBASE_ADMIN_SDK_JSON found, creating file...');
  
  try {
    const content = decodeContent(process.env.FIREBASE_ADMIN_SDK_JSON);
    fs.writeFileSync(adminSdkPath, content);
    console.log('✓ Firebase Admin SDK JSON created successfully');
    
    // Verify the file was created
    if (fs.existsSync(adminSdkPath)) {
      const stats = fs.statSync(adminSdkPath);
      console.log(`  File size: ${stats.size} bytes`);
    }
  } catch (error) {
    console.error('⚠ Warning: Error creating Firebase Admin SDK JSON:', error.message);
  }
} else {
  console.log('ℹ FIREBASE_ADMIN_SDK_JSON not found (optional)');
}

console.log('✓ Firebase configuration setup completed');
