// Strict-Bug-Regeln für die CI (`npm run lint:ci`). Das volle Google-Stylesheet
// aus .eslintrc.js hat ~700 Altlasten und bleibt vorerst nur lokal (`npm run lint`).
module.exports = {
  root: true,
  env: {es2021: true, node: true, browser: true},
  parserOptions: {ecmaVersion: 2021},
  extends: ['eslint:recommended'],
  rules: {
    // Wie im Bestand: mit _ präfixierte Parameter sind gewollt ungenutzt.
    'no-unused-vars': ['warn', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
  },
};
