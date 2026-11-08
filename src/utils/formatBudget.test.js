import { formatBudget } from './formatBudget';

describe('formatBudget', () => {
  it.each([
    ['20', '20,00 €'],
    ['20 €', '20,00 €'],
    ['20€', '20,00 €'],
    ['20,5', '20,50 €'],
    ['20.50 EUR', '20,50 €'],
    ['1.250', '1.250,00 €'],
  ])('formatiert %s als %s', (eingabe, erwartet) => {
    // Geschütztes Leerzeichen vor €: Betrag und Währung brechen nicht auseinander.
    expect(formatBudget(eingabe)).toBe(erwartet.replace(' €', '\u00a0€'));
  });

  it('formatiert in der Sprache der Seite (Wichtel-Link auf Englisch/Französisch)', () => {
    expect(formatBudget('20', 'en')).toBe('€20.00');
    expect(formatBudget('1.250,5', 'fr')).toBe('1\u202f250,50\u00a0€');
    expect(formatBudget('ca. 20 bis 25 €', 'en')).toBe('ca. 20 bis 25 €');
  });

  it('lässt Freitext unverändert', () => {
    expect(formatBudget('ca. 20 bis 25 €')).toBe('ca. 20 bis 25 €');
  });

  it('gibt für leere Werte einen leeren String zurück', () => {
    expect(formatBudget('')).toBe('');
    expect(formatBudget(undefined)).toBe('');
  });
});
