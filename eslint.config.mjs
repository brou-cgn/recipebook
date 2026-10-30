// Lint für das Frontend (src/) – Tech-Check B2. Functions haben eine eigene
// Konfiguration (functions/.eslintrc.ci.js). Die CI bricht nur bei Fehlern ab;
// Warnungen (z. B. exhaustive-deps) sind der sichtbare Altbestand.
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['build/**', 'dist/**', 'functions/**', 'node_modules/**', 'public/**', 'scripts/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.serviceworker, process: 'readonly' }, // process.env.REACT_APP_* ersetzt Vite per define
    },
    settings: { react: { version: 'detect' } },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true, skipRegExps: true }],
      'react/jsx-uses-vars': 'error',
      // Löschaktionen: ausschließlich DeleteRowButton (AGENTS.md), keine eigenen ×-Knöpfe.
      'no-restricted-syntax': ['error', {
        selector: "JSXAttribute[name.name='className'][value.value=/(^|\\s)(remove-btn|remove-child-btn)(\\s|$)/]",
        message: 'Eigener Löschknopf: DeleteRowButton + useUndoableDelete verwenden (AGENTS.md, Löschaktionen).',
      }],
      'react/jsx-uses-react': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
      // Keine Debug-Ausgaben im Produktivcode (Tech-Check T7): sie laufen in jedem Browser
      // und füllten den Testlauf. Bewusste Meldungen über console.info/warn/error.
      'no-console': ['error', { allow: ['info', 'warn', 'error'] }],
    },
  },
  {
    files: ['src/**/*.test.{js,jsx}', 'src/setupTests.js', 'src/test-utils/**', 'src/**/__mocks__/**'],
    languageOptions: { globals: { ...globals.jest, ...globals.node } },
    rules: { 'no-console': 'off' },
  },
];
