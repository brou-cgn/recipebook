import fs from 'fs';
import path from 'path';

// darkMode.css färbt im Dunkelmodus jedes span hell ([data-theme="dark"] span, Spezifität 0-1-1).
// Jeder sichtbare span von HandschriftText muss die Farbe des Aufrufers deshalb mit mindestens
// zwei Klassen übernehmen; sonst erscheint der orange Slogan im Header im Dunkelmodus grau.
describe('HandschriftText CSS', () => {
  const css = fs.readFileSync(path.join(__dirname, 'HandschriftText.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const js = fs.readFileSync(path.join(__dirname, 'HandschriftText.js'), 'utf8');

  const sichtbareSpanKlassen = [...js.matchAll(/<span[^>]*className="(handschrift-text__[\w-]+)"/g)]
    .map((m) => m[1])
    .filter((klasse) => klasse !== 'handschrift-text__vorlesen');

  const selektorenMitInherit = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter(([, , regeln]) => /color:\s*inherit/.test(regeln))
    .flatMap(([, selektoren]) => selektoren.split(',').map((s) => s.trim()));

  test('findet die span-Klassen der Komponente', () => {
    expect(sichtbareSpanKlassen).toEqual(
      expect.arrayContaining(['handschrift-text__bild', 'handschrift-text__wort', 'handschrift-text__zeichen'])
    );
  });

  test.each(['handschrift-text__bild', 'handschrift-text__wort', 'handschrift-text__zeichen'])(
    '%s übernimmt die Farbe mit zwei Klassen',
    (klasse) => {
      const treffer = selektorenMitInherit.filter((selektor) => selektor.endsWith(`.${klasse}`));
      expect(treffer.some((selektor) => (selektor.match(/\./g) || []).length >= 2)).toBe(true);
    }
  );

  test('jede sichtbare span-Klasse ist abgedeckt', () => {
    sichtbareSpanKlassen.forEach((klasse) => {
      expect(selektorenMitInherit.some((selektor) => selektor.endsWith(`.${klasse}`))).toBe(true);
    });
  });
});
