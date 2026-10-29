#!/bin/sh
# Builds Kite.app, installs it to /Applications and puts the `kite` command on PATH.
set -e
cd "$(dirname "$0")/.."
npm run tauri build -- --bundles app
rm -rf /Applications/Kite.app
cp -R src-tauri/target/release/bundle/macos/Kite.app /Applications/
mkdir -p "$HOME/.local/bin"
install -m 755 scripts/kite "$HOME/.local/bin/kite"
echo "Kite kuruldu: /Applications/Kite.app. Bir klasör açmak için: kite ."
