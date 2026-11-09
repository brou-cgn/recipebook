import { formatWichtelDatum } from './wichtelDatum';

describe('formatWichtelDatum', () => {
  it('schreibt den Kalendertag je Sprache aus, ohne in der Zeitzone zu verrutschen', () => {
    expect(formatWichtelDatum('2026-12-13', 'de')).toBe('Sonntag, 13. Dezember 2026');
    expect(formatWichtelDatum('2026-12-13', 'fr')).toBe('dimanche 13 décembre 2026');
    // Britisch, nicht amerikanisch (ob mit Komma nach dem Wochentag, hängt von der ICU-Version ab)
    expect(formatWichtelDatum('2026-12-13', 'en')).toMatch(/^Sunday,? 13 December 2026$/);
    expect(formatWichtelDatum('2027-01-01', 'de')).toBe('Freitag, 1. Januar 2027');
  });

  it('kurz für die Organisator-Ansicht', () => {
    expect(formatWichtelDatum('2026-12-13', 'de', 'kurz')).toBe('So., 13.12.2026');
  });

  it('ohne gültigen Kalendertag leer; unbekannte Sprache ergibt Deutsch', () => {
    for (const wert of ['', null, undefined, '13.12.2026', '2026-02-30', '2026-13-01', 20261213]) {
      expect(formatWichtelDatum(wert)).toBe('');
    }
    expect(formatWichtelDatum('2026-12-13', 'es')).toBe('Sonntag, 13. Dezember 2026');
  });
});
