#!/bin/sh
set -e

cd "$CI_PRIMARY_REPOSITORY_PATH/ios/App"
pod install
