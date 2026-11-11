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

// Das Dropdown lebt im Stapelkontext des Headers (z-index 100); ohne Anhebung liegen FABs (1101) darüber.
describe('Header CSS offenes Menü', () => {
  const css = fs.readFileSync(path.join(__dirname, 'Header.css'), 'utf8');

  test('offenes Menü hebt den Header über FABs und Bottom-Navigation', () => {
    const m = css.match(/\.header\.header--menu-open\s*\{\s*z-index:\s*(\d+);/);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBeGreaterThan(1200);
  });
});
