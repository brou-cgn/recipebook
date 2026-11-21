// Das Inline-Skript in index.html setzt data-theme, bevor React startet. Sonst malt iOS den
// Streifen unter der Statusleiste beim Kaltstart im Dark Mode kurz hell (body noch hell).
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const match = html.match(/<script id="dark-mode-bootstrap">([\s\S]*?)<\/script>/);

function run({ stored, systemDark }) {
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
  if (stored !== undefined) localStorage.setItem('darkModePreference', stored);
  window.matchMedia = jest.fn().mockReturnValue({ matches: systemDark });
  // eslint-disable-next-line no-new-func
  new Function(match[1])();
  return document.documentElement.getAttribute('data-theme');
}

describe('index.html – Dark Mode vor dem ersten Bild', () => {
  test('Skript steht im head vor dem App-Einstieg', () => {
    expect(match).not.toBeNull();
    expect(html.indexOf('id="dark-mode-bootstrap"')).toBeLessThan(html.indexOf('</head>'));
    expect(html.indexOf('id="dark-mode-bootstrap"')).toBeLessThan(html.indexOf('src="/src/index.js"'));
  });

  test('liest denselben localStorage-Schlüssel wie customLists.js', () => {
    const src = fs.readFileSync(path.join(__dirname, 'utils', 'customLists.js'), 'utf8');
    expect(src).toMatch(/const DARK_MODE_KEY = 'darkModePreference';/);
  });

  test.each([
    ['true', false, 'dark'],
    ['false', true, null],
    ['auto', true, 'dark'],
    ['auto', false, null],
    [undefined, true, 'dark'],
    [undefined, false, null],
  ])('gespeichert %s, System dunkel %s → %s', (stored, systemDark, expected) => {
    expect(run({ stored, systemDark })).toBe(expected);
  });
});
