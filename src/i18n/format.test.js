import { formatiereDatum, formatiereZahl } from './format';

// Französisch trennt Tausender mit einem schmalen geschützten Leerzeichen.
const normal = (text) => text.replace(/\s/g, ' ');

describe('formatiereZahl', () => {
  it('schreibt Dezimal- und Tausendertrenner je Sprache', () => {
    expect(formatiereZahl(1234.5, 'de')).toBe('1.234,5');
    expect(formatiereZahl(1234.5, 'en')).toBe('1,234.5');
    expect(normal(formatiereZahl(1234.5, 'fr'))).toBe('1 234,5');
  });

  it('reicht Optionen an Intl weiter', () => {
    expect(normal(formatiereZahl(0.5, 'de', { style: 'percent' }))).toBe('50 %');
    expect(formatiereZahl(2, 'en', { minimumFractionDigits: 1 })).toBe('2.0');
  });

  it('ohne Zahl leer', () => {
    expect(formatiereZahl(NaN, 'de')).toBe('');
    expect(formatiereZahl('3', 'de')).toBe('');
    expect(formatiereZahl(undefined, 'de')).toBe('');
  });

  it('eine unbekannte Sprache schreibt deutsch', () => {
    expect(formatiereZahl(1.5, 'es')).toBe('1,5');
  });
});

describe('formatiereDatum', () => {
  const tag = new Date(2026, 10, 22, 12, 0, 0);

  it('schreibt das Datum je Sprache aus', () => {
    expect(formatiereDatum(tag, 'de')).toBe('22. November 2026');
    expect(formatiereDatum(tag, 'en')).toBe('22 November 2026');
    expect(formatiereDatum(tag, 'fr')).toBe('22 novembre 2026');
  });

  it('nimmt Zeitstempel, Text und Firestore-Timestamps', () => {
    expect(formatiereDatum(tag.getTime(), 'en')).toBe('22 November 2026');
    expect(formatiereDatum({ toDate: () => tag }, 'fr')).toBe('22 novembre 2026');
    expect(formatiereDatum(tag, 'en', { day: '2-digit', month: '2-digit', year: 'numeric' })).toBe('22/11/2026');
  });

  it('ohne gültiges Datum leer', () => {
    expect(formatiereDatum(null, 'de')).toBe('');
    expect(formatiereDatum(undefined, 'de')).toBe('');
    expect(formatiereDatum('', 'de')).toBe('');
    expect(formatiereDatum('kein Datum', 'de')).toBe('');
  });
});
