/**
 * Hosting- und Manifest-Vorgaben (Tech-Check M3, M5, M6, F4).
 * Liest die Konfigurationsdateien direkt, damit ein späterer Eingriff
 * (Sourcemaps an, Sitemap zurück, Manifest ohne maskable Icon) die CI rot macht.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Manifest', () => {
  const manifest = JSON.parse(read('public/manifest.json'));

  test('background_color ist eine gültige Farbe', () => {
    expect(manifest.background_color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test('es gibt ein maskable 512er-Icon, und die Datei existiert', () => {
    const icon = manifest.icons.find((i) => i.purpose === 'maskable');
    expect(icon).toBeDefined();
    expect(icon.sizes).toBe('512x512');
    expect(fs.existsSync(path.join(root, 'public', icon.src))).toBe(true);
  });
});

describe('Hosting', () => {
  const firebase = JSON.parse(read('firebase.json'));
  const headerFor = (source) =>
    firebase.hosting.headers.find((h) => h.source === source)?.headers || [];

  test('Build erzeugt keine Sourcemaps', () => {
    expect(read('vite.config.mjs')).toMatch(/sourcemap:\s*false/);
  });

  test('gehashte Assets sind unbegrenzt cachebar', () => {
    const cache = headerFor('/assets/**').find((h) => h.key === 'Cache-Control');
    expect(cache.value).toMatch(/immutable/);
  });

  test('Basis-Security-Header sind gesetzt', () => {
    const keys = headerFor('**').map((h) => h.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'X-Content-Type-Options',
        'X-Frame-Options',
        'Referrer-Policy',
        'Content-Security-Policy',
      ])
    );
  });

  test('robots.txt sperrt alles, keine Sitemap, keine Demo-Seiten', () => {
    expect(read('public/robots.txt')).toMatch(/^Disallow:\s*\/\s*$/m);
    expect(read('public/robots.txt')).not.toMatch(/sitemap/i);
    ['sitemap.xml', 'demo.html', 'draft-checkbox-demo.html'].forEach((file) => {
      expect(fs.existsSync(path.join(root, 'public', file))).toBe(false);
    });
  });
});
