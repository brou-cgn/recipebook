// Bild-, Font- und sonstige Datei-Importe liefern in Tests den Dateinamen als
// String – wie bisher unter react-scripts, damit Tests, die auf `src`-Attribute
// prüfen, unverändert weiterlaufen.
const path = require('path');

module.exports = {
  process(src, filename) {
    const assetFilename = JSON.stringify(path.basename(filename));
    return { code: `module.exports = ${assetFilename};` };
  },
};
