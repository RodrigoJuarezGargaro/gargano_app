#!/usr/bin/env bash

set -euo pipefail

echo "▸ Copying google-services.json from EAS Secret..."

if [ -n "${GOOGLE_SERVICES_JSON:-}" ]; then
  echo "▸ GOOGLE_SERVICES_JSON found, copying to project root..."
  echo "$GOOGLE_SERVICES_JSON" > "$EAS_BUILD_WORKDIR/google-services.json"
  echo "✓ google-services.json copied successfully"
else
  echo "⚠ GOOGLE_SERVICES_JSON not found in environment"
  exit 1
fi

if [ -n "${FIREBASE_ADMIN_SDK_JSON:-}" ]; then
  echo "▸ FIREBASE_ADMIN_SDK_JSON found, copying to project root..."
  echo "$FIREBASE_ADMIN_SDK_JSON" > "$EAS_BUILD_WORKDIR/garganomobile-firebase-adminsdk-fbsvc-4846acb8bf.json"
  echo "✓ Firebase Admin SDK JSON copied successfully"
else
  echo "ℹ FIREBASE_ADMIN_SDK_JSON not found (optional)"
fi
