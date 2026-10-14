/**
 * Build-Konfiguration (Vite) – ersetzt Create React App / react-scripts
 * (Tech-Check B1). Ziel war ein Austausch des Werkzeugs ohne Änderung am
 * Verhalten der App; die Abnahme steht in docs/setup/vite-migration-pwa-abnahme.md.
 *
 * Bewusst gleich geblieben:
 * - Ausgabe nach build/ (firebase.json: "public": "build").
 * - Service-Worker unter /service-worker.js. Bestehende Installationen fragen
 *   genau diese URL nach Updates ab; ein neuer Name würde sie nie erreichen.
 * - Umgebungsvariablen heißen weiter REACT_APP_* und werden im Code weiter als
 *   process.env.REACT_APP_* gelesen. So bleiben GitHub-Secrets, .env.local und
 *   die Jest-Tests unverändert. Vite ersetzt die Ausdrücke beim Build.
 */
import { defineConfig, loadEnv, transformWithOxc } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Das Projekt hat JSX in .js-Dateien (CRA-Konvention). Vite erwartet JSX nur
// in .jsx – dieses Plugin übersetzt die .js-Dateien unter src/ vorab als JSX.
const jsxInJs = {
  name: 'recipebook:jsx-in-js',
  enforce: 'pre',
  async transform(code, id) {
    if (!/[\\/]src[\\/].*\.js$/.test(id) || id.includes('node_modules')) return null;
    return transformWithOxc(code, id, { lang: 'jsx', jsx: { runtime: 'automatic' } });
  },
};

export default defineConfig(({ mode }) => {
  // Wie bei CRA: .env, .env.local, .env.[mode] usw. plus Variablen aus der
  // Umgebung (CI-Secrets). Nur REACT_APP_* gelangt in den Client-Code.
  const env = loadEnv(mode, process.cwd(), 'REACT_APP_');

  // `process.env` als Objekt ersetzen, damit auch nicht gesetzte Variablen
  // `undefined` ergeben (wie unter CRA) statt einen ReferenceError auf
  // `process` auszulösen.
  const processEnv = {
    ...env,
    NODE_ENV: mode === 'production' ? 'production' : 'development',
    PUBLIC_URL: '',
  };

  return {
    plugins: [
      jsxInJs,
      react(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'service-worker.js',
        // Registrierung läuft wie bisher über src/serviceWorkerRegistration.js.
        injectRegister: false,
        // public/manifest.json bleibt die einzige Quelle für das Manifest.
        manifest: false,
        injectManifest: {
          // Wie unter CRA: index.html plus die gebündelten JS/CSS/Medien –
          // nicht die Dateien aus public/ (z. B. firebase-messaging-sw.js).
          globPatterns: ['index.html', 'assets/**/*.{js,css,png,jpg,jpeg,gif,svg,webp,woff,woff2}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
      }),
    ],
    define: {
      'process.env': JSON.stringify(processEnv),
    },
    optimizeDeps: {
      rolldownOptions: {
        moduleTypes: { '.js': 'jsx' },
      },
    },
    server: {
      port: 3000,
    },
    preview: {
      port: 3000,
    },
    build: {
      outDir: 'build',
      // Ältere iPhones mitnehmen: Vites Standard setzt Safari 16 voraus,
      // CRA übersetzte für ">0.2%, not dead".
      target: ['es2020', 'chrome87', 'edge88', 'firefox78', 'safari14'],
      sourcemap: true,
    },
  };
});
