/**
 * Eigenständige Jest-Konfiguration, seit das Projekt mit Vite statt
 * Create React App gebaut wird (Tech-Check B1).
 *
 * Bildet die Konfiguration nach, die react-scripts 5 intern verwendet hat, damit
 * die bestehenden Tests ohne Änderung weiterlaufen. Wichtig dabei:
 * - resetMocks: true – viele Tests verlassen sich darauf (siehe
 *   ShoppingListModal.test.js).
 * - fetch wie unter react-scripts, kein globales crypto wie unter jsdom 16
 *   (config/jest/polyfills.js).
 * - Firebase in der Node-Variante wie unter Jest 27 (config/jest/resolver.js).
 * - CSS-Importe werden zu leeren Modulen, Datei-Importe zum Dateinamen.
 * - yaml wird auf seinen CommonJS-Build gelenkt: jest-environment-jsdom löst
 *   package-"exports" mit der Bedingung "browser" auf und fände sonst einen
 *   reinen ESM-Build, den Jest nicht laden kann.
 * - Snapshot-Format wie unter Jest 27, damit vorhandene Snapshots gültig bleiben.
 * - Babel nur für Jest (configFile: false): der Vite-Build braucht kein Babel.
 *
 * Vitest wäre der nächste Schritt; bis dahin bleibt Jest, weil die Tests
 * tausendfach jest.* verwenden.
 */
module.exports = {
  roots: ['<rootDir>/src'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,jsx}',
    '<rootDir>/src/**/*.{spec,test}.{js,jsx}',
  ],
  testEnvironment: 'jsdom',
  resolver: '<rootDir>/config/jest/resolver.js',
  setupFiles: ['<rootDir>/config/jest/polyfills.js'],
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
  transform: {
    '^.+\\.(js|jsx|mjs|cjs)$': [
      'babel-jest',
      {
        babelrc: false,
        configFile: false,
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          ['@babel/preset-react', { runtime: 'automatic' }],
        ],
      },
    ],
    '^.+\\.css$': '<rootDir>/config/jest/cssTransform.js',
    '^(?!.*\\.(js|jsx|mjs|cjs|css|json)$)': '<rootDir>/config/jest/fileTransform.js',
  },
  transformIgnorePatterns: [
    '[/\\\\]node_modules[/\\\\].+\\.(js|jsx|mjs|cjs)$',
    '^.+\\.module\\.css$',
  ],
  moduleNameMapper: {
    '^.+\\.module\\.css$': 'identity-obj-proxy',
    '^yaml$': '<rootDir>/node_modules/yaml/dist/index.js',
  },
  moduleFileExtensions: ['js', 'jsx', 'mjs', 'cjs', 'json', 'node'],
  resetMocks: true,
  snapshotFormat: { escapeString: true, printBasicPrototype: true },
};
