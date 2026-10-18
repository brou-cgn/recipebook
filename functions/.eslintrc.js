// Lint für functions/: nur Regeln, die Fehler finden, keine Stilregeln
// (Tech-Check F11, 18.10.2026). Das Google-Stylesheet meldete ~730
// Formatierungs-Altlasten; Einheitlichkeit der Formatierung wird bewusst
// nicht erzwungen. Lokal (`npm run lint`) und CI (`lint:ci`) nutzen diese Datei.
module.exports = {
  root: true,
  // browser: Code in page.evaluate() läuft im Browser (document, window).
  env: {es2021: true, node: true, browser: true},
  parserOptions: {ecmaVersion: 2021},
  extends: ['eslint:recommended'],
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
};
