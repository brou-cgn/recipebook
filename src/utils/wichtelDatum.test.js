import { formatWichtelDatum, heuteAlsWichtelDatum, wichtelAbstandText, wichtelKalenderblatt } from './wichtelDatum';

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

describe('Formular-Helfer', () => {
  const jetzt = new Date(2026, 10, 10, 23, 30); // 10.11.2026, spätabends Ortszeit

  it('Kalenderblatt: Monat kurz in Großbuchstaben und Tag', () => {
    expect(wichtelKalenderblatt('2026-12-19')).toEqual({ monat: 'DEZ', tag: '19' });
    expect(wichtelKalenderblatt('2027-05-01')).toEqual({ monat: 'MAI', tag: '1' });
    expect(wichtelKalenderblatt('')).toBeNull();
  });

  it('Abstand in Tagen ab heute', () => {
    expect(wichtelAbstandText('2026-11-10', jetzt)).toBe('heute');
    expect(wichtelAbstandText('2026-11-11', jetzt)).toBe('morgen');
    expect(wichtelAbstandText('2026-12-19', jetzt)).toBe('in 39 Tagen');
    expect(wichtelAbstandText('2026-11-09', jetzt)).toBe('gestern');
    expect(wichtelAbstandText('2026-11-01', jetzt)).toBe('vor 9 Tagen');
    expect(wichtelAbstandText('kein Datum', jetzt)).toBe('');
  });

  it('heute als JJJJ-MM-TT in Ortszeit', () => {
    expect(heuteAlsWichtelDatum(jetzt)).toBe('2026-11-10');
    expect(heuteAlsWichtelDatum(new Date(2027, 0, 5))).toBe('2027-01-05');
  });
});
