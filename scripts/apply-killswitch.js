#!/usr/bin/env node
/**
 * Ersetzt build/service-worker.js durch den Notausgang
 * (config/service-worker-killswitch.js, Tech-Check M9).
 *
 * Läuft nach `npm run build`. Ablauf und Verfahren:
 * docs/setup/notausgang-service-worker.md
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'config', 'service-worker-killswitch.js');
const target = path.join(root, 'build', 'service-worker.js');

if (!fs.existsSync(path.dirname(target))) {
  console.error('build/ fehlt. Zuerst `npm run build` ausführen.');
  process.exit(1);
}

fs.copyFileSync(source, target);
// Die Source-Map des regulären Service-Workers passt nicht mehr zur Datei.
fs.rmSync(`${target}.map`, { force: true });
console.log('build/service-worker.js durch den Notausgang ersetzt.');
