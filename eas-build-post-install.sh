#!/usr/bin/env bash

set -euo pipefail

echo "========================================"
echo "▸ Running EAS post-install hook..."
echo "▸ Current directory: $(pwd)"
echo "▸ Node version: $(node --version)"
echo "========================================"

# Execute the Node.js script
if [ -f "./scripts/setup-firebase-config.js" ]; then
  echo "▸ Executing setup-firebase-config.js..."
  node ./scripts/setup-firebase-config.js
else
  echo "✖ Error: setup-firebase-config.js not found!"
  exit 1
fi

echo "========================================"
echo "✓ EAS post-install hook completed"
echo "========================================"
