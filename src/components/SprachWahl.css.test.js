import fs from 'fs';
import path from 'path';

// darkMode.css färbt im Dunkelmodus jedes span hell ([data-theme="dark"] span, Spezifität 0-1-1).
// In der Zeile einer Sprache sind Hülle und Name span; beide müssen die Farbe der Zeile mit mindestens
// zwei Klassen übernehmen, sonst bleibt die aktive Sprache im Dunkelmodus weiß statt orange.
describe('SprachWahl CSS', () => {
  const css = fs.readFileSync(path.join(__dirname, 'SprachWahl.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const regeln = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selektoren, inhalt]) => ({
    selektoren: selektoren.split(',').map((s) => s.trim()),
    inhalt,
  }));
  const farbeFuer = (klasse) => regeln
    .filter(({ inhalt }) => /(^|;|\s)color:/.test(inhalt))
    .flatMap(({ selektoren }) => selektoren)
    .filter((selektor) => selektor.endsWith(`.${klasse}`));

  test.each(['sprachwahl-zeile__text', 'sprachwahl-zeile__name', 'sprachwahl-zeile__zweit', 'sprachwahl-chip__kuerzel'])(
    '%s hat eine eigene Farbe mit mindestens zwei Klassen',
    (klasse) => {
      expect(farbeFuer(klasse).some((selektor) => (selektor.match(/\./g) || []).length >= 2)).toBe(true);
    }
  );

  test('die aktive Zeile färbt sich mit dem Akzent für Text', () => {
    const aktiv = regeln.find(({ selektoren, inhalt }) => selektoren.includes('.sprachwahl-zeile--aktiv') && /color:/.test(inhalt));
    expect(aktiv.inhalt).toMatch(/color:\s*var\(--color-accent-text\)/);
  });
});
