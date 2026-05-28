#!/usr/bin/env bash

set -euo pipefail

echo "▸ Running EAS post-install hook..."

# Execute the Node.js script
node ./scripts/setup-firebase-config.js

echo "✓ EAS post-install hook completed"
