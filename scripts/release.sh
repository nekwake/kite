#!/bin/sh
# Bumps the version everywhere, commits and tags it. Pushing the tag starts
# the GitHub Actions release.  Usage: npm run release -- 0.2.0
set -e
cd "$(dirname "$0")/.."
v="$1"
[ -n "$v" ] || { echo "kullanım: npm run release -- <sürüm>  (ör. 0.2.0)" >&2; exit 1; }
node -e '
  const fs = require("fs"), v = process.argv[1];
  for (const f of ["package.json", "src-tauri/tauri.conf.json"]) {
    const j = JSON.parse(fs.readFileSync(f, "utf8")); j.version = v;
    fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
  }
  const c = "src-tauri/Cargo.toml";
  fs.writeFileSync(c, fs.readFileSync(c, "utf8").replace(/^version = ".*"/m, `version = "${v}"`));
' "$v"
(cd src-tauri && cargo update -p kite --quiet 2>/dev/null || true)
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock CHANGELOG.md
git commit -m "Sürüm $v"
git tag "v$v"
echo "Hazır. Yayınlamak için: git push && git push origin v$v"
