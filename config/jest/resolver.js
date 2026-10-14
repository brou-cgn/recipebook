// Firebase-Pakete wie unter Jest 27 (react-scripts) in ihrer Node-Variante
// auflösen. jest-environment-jsdom (Jest 29) wählt sonst über package-"exports"
// die Browser-Builds: die sprechen dann über das globale `fetch` (das Tests
// mocken) und versuchen echte Netzwerkverbindungen, statt sich wie bisher zu
// verhalten. Alle anderen Pakete lösen unverändert auf.
const NODE_CONDITIONS = ['node', 'require', 'default'];

module.exports = (request, options) => {
  if (/^(@firebase\/|firebase(\/|$))/.test(request)) {
    return options.defaultResolver(request, { ...options, conditions: NODE_CONDITIONS });
  }
  return options.defaultResolver(request, options);
};
