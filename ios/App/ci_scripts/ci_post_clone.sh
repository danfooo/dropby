#!/bin/sh
set -e

# Install Node 20 (better-sqlite3 requires it; Node 26 breaks native builds)
brew install node@20
export PATH="/usr/local/opt/node@20/bin:$PATH"

# Install node dependencies and build web assets
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm install
npm run build

# Sync Capacitor (copies web assets + runs pod install)
npx cap sync ios
