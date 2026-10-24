/**
 * Start-Bundle (Tech-Check P2): Module, die beim App-Start geladen werden, dürfen
 * Import-, OCR- und Parser-Code nicht statisch importieren. Sonst landen rund
 * 20 kB mehr im Start-Chunk. Die Runner werden per import() nachgeladen.
 */
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
const HEAVY = /from\s+['"][./]+(?:utils\/)?(webImportService|importRunners|aiOcrService|ocrParser)['"]/;

describe('Start-Bundle', () => {
  test.each([
    'contexts/RecipeImportQueueContext.js',
    'utils/webImportPin.js',
  ])('%s importiert keine Import-Module statisch', (file) => {
    expect(read(file)).not.toMatch(HEAVY);
  });

  test('RecipeImportQueueContext lädt die Runner dynamisch', () => {
    expect(read('contexts/RecipeImportQueueContext.js')).toMatch(/import\(['"]\.\.\/utils\/importRunners['"]\)/);
  });
});
