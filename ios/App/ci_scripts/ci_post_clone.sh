#!/bin/sh
set -e

# Install Homebrew and Node
brew install node

# Install node dependencies and build web assets
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm install
npm run build

# Sync Capacitor (copies web assets + runs pod install)
npx cap sync ios
