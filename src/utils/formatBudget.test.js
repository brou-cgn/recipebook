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
    expect(formatBudget(eingabe)).toBe(erwartet);
  });

  it('lässt Freitext unverändert', () => {
    expect(formatBudget('ca. 20 bis 25 €')).toBe('ca. 20 bis 25 €');
  });

  it('gibt für leere Werte einen leeren String zurück', () => {
    expect(formatBudget('')).toBe('');
    expect(formatBudget(undefined)).toBe('');
  });
});
