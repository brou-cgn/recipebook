#!/usr/bin/env bash
# Screenshots der App gegen lokale Firebase-Emulatoren (docs/setup/screenshots.md).
# Startet Auth-, Firestore- und Storage-Emulator, legt die Testdaten an (seed.js),
# fotografiert die Bildschirme (capture.js) und fährt alles wieder herunter.
#
# Aufruf aus dem Repo: scripts/screenshots/run.sh [Ausgabeordner] [--only name,name]
# Ausgabeordner relativ zum Repo, Standard: screenshots-out/ (steht in .gitignore).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [ ! -x "$ROOT/rules-tests/node_modules/.bin/firebase" ]; then
  echo "firebase-tools fehlt: einmal (cd rules-tests && npm ci) ausführen" >&2
  exit 1
fi
ARGS=""
for a in "$@"; do ARGS="$ARGS $(printf '%q' "$a")"; done
cd "$ROOT/rules-tests"
exec npx firebase emulators:exec --config ../firebase.json --only auth,firestore,storage --project demo-recipebook \
  "cd \"$ROOT\" && node scripts/screenshots/seed.js && node scripts/screenshots/capture.js$ARGS"
