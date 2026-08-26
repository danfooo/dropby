#!/bin/sh
set -e

# Node 24 — matches local dev and the production Dockerfile.
# Node 22 is the hard floor: @capacitor/cli 8 and better-sqlite3 13 both require >=22.
# Node 26 breaks better-sqlite3's native build, so don't use the unversioned `node` formula.
brew install node@24
# node@24 is keg-only, so it must be put on PATH explicitly. `brew --prefix` resolves the
# right location on both Apple silicon (/opt/homebrew) and Intel (/usr/local) runners.
export PATH="$(brew --prefix node@24)/bin:$PATH"
node -v

# Install node dependencies and build web assets
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm install
npm run build

# Sync Capacitor (copies web assets + runs pod install)
npx cap sync ios
