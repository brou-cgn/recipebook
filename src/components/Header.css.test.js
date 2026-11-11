import fs from 'fs';
import path from 'path';

// Ein ausgeblendeter Header (Kochmodus quer) muss auch ab 769 px Breite weg sein: Ein Handy quer ist mit
// viewport-fit=cover breiter, und dort hebt die Desktop-Regel das Wegschieben (transform) auf.
describe('Header CSS ausgeblendet', () => {
  const css = fs.readFileSync(path.join(__dirname, 'Header.css'), 'utf8');
  const desktop = css.slice(css.indexOf('@media (min-width: 769px)'));

  test('ab 769 px wird der ausgeblendete Header entfernt, nicht nur verschoben', () => {
    expect(desktop).toMatch(/\.header\.header-hidden\s*\{\s*display:\s*none;\s*\}/);
  });
});

// Auf kleinen Displays war das Hamburger-Menü länger als der Bildschirm und die unteren
// Einträge (z. B. Abmelden) waren nicht erreichbar – das Dropdown muss begrenzt und scrollbar sein.
describe('Header CSS Hamburger-Dropdown', () => {
  const css = fs.readFileSync(path.join(__dirname, 'Header.css'), 'utf8');
  const rule = css.match(/\.hamburger-dropdown\s*\{([^}]*)\}/)[1];

  test('hat eine Maximalhöhe und scrollt vertikal', () => {
    expect(rule).toMatch(/max-height:\s*calc\(100dvh/);
    expect(rule).toMatch(/overflow-y:\s*auto/);
    expect(rule).not.toMatch(/overflow:\s*hidden/);
  });
});
