// Lint für functions/: nur Regeln, die Fehler finden, keine Stilregeln
// (Tech-Check F11, 18.10.2026). Das Google-Stylesheet meldete ~730
// Formatierungs-Altlasten; Einheitlichkeit der Formatierung wird bewusst
// nicht erzwungen. Lokal (`npm run lint`) und CI (`lint:ci`) nutzen diese Datei.
// ESLint 10 kennt kein .eslintrc mehr – Flat Config.
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {ignores: ['node_modules/**']},
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      // browser: Code in page.evaluate() läuft im Browser (document, window).
      globals: {...globals.node, ...globals.browser},
    },
    // Wie bisher: Disable-Direktiven nicht auf Nutzung prüfen.
    linterOptions: {reportUnusedDisableDirectives: 'off'},
    rules: {
      'no-restricted-globals': ['error', 'name', 'length'],
      'prefer-const': 'error',
      // Mit _ präfixierte Namen sind gewollt ungenutzt; Rest-Destructuring
      // ({a, ...rest}) blendet Felder bewusst aus.
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
    },
  },
];
