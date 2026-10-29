#!/bin/sh
set -e

# Node 26 (LTS since 2026-10-28) — matches local dev and the production Dockerfile.
# Node 22 is the hard floor: @capacitor/cli 8 and better-sqlite3 13 both require >=22.
# node@26 is Homebrew's alias for the unversioned `node` formula; `brew --prefix` resolves
# the right location on both Apple silicon (/opt/homebrew) and Intel (/usr/local) runners.
brew install node@26
export PATH="$(brew --prefix node@26)/bin:$PATH"
node -v

# Install node dependencies and build web assets
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm install
npm run build

# Sync Capacitor (copies web assets + regenerates CapApp-SPM/Package.swift; no CocoaPods since 4bc35c5)
npx cap sync ios
