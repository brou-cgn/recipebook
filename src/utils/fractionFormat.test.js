import { formatQuantityFraction, parseFractionQuantity } from './fractionFormat';

describe('formatQuantityFraction', () => {
  it('formatiert ganze Zahlen ohne Bruch', () => {
    expect(formatQuantityFraction(2)).toBe('2');
    expect(formatQuantityFraction(0)).toBe('0');
  });

  it('formatiert reine Brüche ohne führende Ganzzahl', () => {
    expect(formatQuantityFraction(0.5)).toBe('1/2');
    expect(formatQuantityFraction(0.25)).toBe('1/4');
    expect(formatQuantityFraction(0.75)).toBe('3/4');
    expect(formatQuantityFraction(1 / 3)).toBe('1/3');
  });

  it('formatiert gemischte Zahlen (ganze Zahl + Bruch)', () => {
    expect(formatQuantityFraction(1.75)).toBe('1 3/4');
    expect(formatQuantityFraction(1 + 1 / 3)).toBe('1 1/3');
    expect(formatQuantityFraction(2.5)).toBe('2 1/2');
  });

  it('faellt bei ungewoehnlichen Werten auf Dezimalzahl mit Komma zurueck', () => {
    expect(formatQuantityFraction(1.6)).toBe('1,6');
  });

  it('gibt einen leeren String fuer ungueltige Werte zurueck', () => {
    expect(formatQuantityFraction(null)).toBe('');
    expect(formatQuantityFraction(undefined)).toBe('');
    expect(formatQuantityFraction('')).toBe('');
  });
});

describe('parseFractionQuantity', () => {
  it('parst gemischte Brüche', () => {
    expect(parseFractionQuantity('1 3/4')).toBeCloseTo(1.75, 6);
    expect(parseFractionQuantity('1 1/3')).toBeCloseTo(1 + 1 / 3, 6);
  });

  it('parst reine Brüche', () => {
    expect(parseFractionQuantity('1/2')).toBeCloseTo(0.5, 6);
  });

  it('parst ganze Zahlen und Dezimalzahlen', () => {
    expect(parseFractionQuantity('2')).toBe(2);
    expect(parseFractionQuantity('1,5')).toBeCloseTo(1.5, 6);
    expect(parseFractionQuantity('1.5')).toBeCloseTo(1.5, 6);
  });

  it('gibt NaN fuer nicht interpretierbare Eingaben zurueck', () => {
    expect(Number.isNaN(parseFractionQuantity('abc'))).toBe(true);
    expect(Number.isNaN(parseFractionQuantity(''))).toBe(true);
    expect(Number.isNaN(parseFractionQuantity(null))).toBe(true);
  });
});
