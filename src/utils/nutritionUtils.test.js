import { mapNutritionCalcError, naehrwertePerPortion, naehrwerteToTotals } from './nutritionUtils';

describe('mapNutritionCalcError', () => {
  it('returns network error message for functions/unavailable code', () => {
    const err = { code: 'functions/unavailable', message: '' };
    expect(mapNutritionCalcError(err)).toBe(
      'Netzwerkfehler. Bitte Internetverbindung prüfen und erneut versuchen.'
    );
  });

  it('returns network error message when message contains "network"', () => {
    const err = { code: '', message: 'Network request failed' };
    expect(mapNutritionCalcError(err)).toBe(
      'Netzwerkfehler. Bitte Internetverbindung prüfen und erneut versuchen.'
    );
  });

  it('returns network error message when message contains "failed to fetch"', () => {
    const err = { code: '', message: 'Failed to fetch' };
    expect(mapNutritionCalcError(err)).toBe(
      'Netzwerkfehler. Bitte Internetverbindung prüfen und erneut versuchen.'
    );
  });

  it('returns unauthenticated message for functions/unauthenticated', () => {
    const err = { code: 'functions/unauthenticated', message: '' };
    expect(mapNutritionCalcError(err)).toBe(
      'Sie müssen angemeldet sein, um Nährwerte zu berechnen.'
    );
  });

  it('returns deadline exceeded message for functions/deadline-exceeded', () => {
    const err = { code: 'functions/deadline-exceeded', message: '' };
    expect(mapNutritionCalcError(err)).toBe(
      'Die Berechnung hat zu lange gedauert. Bitte versuchen Sie es erneut.'
    );
  });

  it('returns resource exhausted message for functions/resource-exhausted', () => {
    const err = { code: 'functions/resource-exhausted', message: '' };
    expect(mapNutritionCalcError(err)).toBe(
      'Zu viele Anfragen. Bitte versuchen Sie es später erneut.'
    );
  });

  it('returns internal error message for functions/internal', () => {
    const err = { code: 'functions/internal', message: '' };
    expect(mapNutritionCalcError(err)).toBe(
      'Fehler beim Abrufen der Nährwertdaten. Bitte versuchen Sie es erneut.'
    );
  });

  it('returns the error message for unknown error codes', () => {
    const err = { code: 'functions/unknown', message: 'Something went wrong' };
    expect(mapNutritionCalcError(err)).toBe('Something went wrong');
  });

  it('returns fallback message when error code is unknown and message is empty', () => {
    const err = { code: 'functions/unknown', message: '' };
    expect(mapNutritionCalcError(err)).toBe(
      'Fehler beim Berechnen der Nährwerte. Bitte versuchen Sie es erneut.'
    );
  });
});

describe('naehrwertePerPortion', () => {
  it('divides stored totals by portionen', () => {
    const totals = { kalorien: 1400, protein: 80, fett: 40, kohlenhydrate: 200, zucker: 20, ballaststoffe: 12, salz: 3.2 };
    const result = naehrwertePerPortion(totals, 4);
    expect(result.kalorien).toBe(350);
    expect(result.protein).toBe(20);
    expect(result.fett).toBe(10);
    expect(result.kohlenhydrate).toBe(50);
    expect(result.zucker).toBe(5);
    expect(result.ballaststoffe).toBe(3);
    expect(result.salz).toBe(0.8);
  });

  it('rounds kalorien to integer', () => {
    const result = naehrwertePerPortion({ kalorien: 1401 }, 4);
    expect(result.kalorien).toBe(350);
  });

  it('rounds protein to 1 decimal place', () => {
    const result = naehrwertePerPortion({ protein: 10 }, 3);
    expect(result.protein).toBe(3.3);
  });

  it('rounds salz to 2 decimal places', () => {
    const result = naehrwertePerPortion({ salz: 1.0 }, 3);
    expect(result.salz).toBe(0.33);
  });

  it('returns empty object for null/undefined naehrwerte', () => {
    expect(naehrwertePerPortion(null, 4)).toEqual({});
    expect(naehrwertePerPortion(undefined, 4)).toEqual({});
  });

  it('defaults portionen to 1 when 0 is provided', () => {
    const totals = { kalorien: 500, protein: 30 };
    const result = naehrwertePerPortion(totals, 0);
    expect(result.kalorien).toBe(500);
    expect(result.protein).toBe(30);
  });

  it('omits fields that are null in the stored totals', () => {
    const result = naehrwertePerPortion({ kalorien: 400, protein: null }, 2);
    expect(result.kalorien).toBe(200);
    expect(result.protein).toBeUndefined();
  });
});

describe('naehrwerteToTotals', () => {
  it('multiplies per-portion values by portionen', () => {
    const perPortion = { kalorien: 350, protein: 20, fett: 10, kohlenhydrate: 50, zucker: 5, ballaststoffe: 3, salz: 0.8 };
    const result = naehrwerteToTotals(perPortion, 4);
    expect(result.kalorien).toBe(1400);
    expect(result.protein).toBe(80);
    expect(result.fett).toBe(40);
    expect(result.kohlenhydrate).toBe(200);
    expect(result.zucker).toBe(20);
    expect(result.ballaststoffe).toBe(12);
    expect(result.salz).toBe(3.2);
  });

  it('rounds kalorien to integer', () => {
    const result = naehrwerteToTotals({ kalorien: 333.3 }, 3);
    expect(result.kalorien).toBe(1000);
  });

  it('rounds protein to 1 decimal place', () => {
    const result = naehrwerteToTotals({ protein: 3.3 }, 3);
    expect(result.protein).toBe(9.9);
  });

  it('rounds salz to 2 decimal places', () => {
    const result = naehrwerteToTotals({ salz: 0.33 }, 3);
    expect(result.salz).toBe(0.99);
  });

  it('omits null values from result', () => {
    const result = naehrwerteToTotals({ kalorien: null, protein: 20 }, 2);
    expect(result.kalorien).toBeUndefined();
    expect(result.protein).toBe(40);
  });

  it('defaults portionen to 1 when 0 is provided', () => {
    const result = naehrwerteToTotals({ kalorien: 500 }, 0);
    expect(result.kalorien).toBe(500);
  });

  it('round-trips with naehrwertePerPortion', () => {
    const original = { kalorien: 1400, protein: 80, fett: 40, kohlenhydrate: 200, zucker: 20, ballaststoffe: 12, salz: 3.2 };
    const perPortion = naehrwertePerPortion(original, 4);
    const backToTotals = naehrwerteToTotals(perPortion, 4);
    expect(backToTotals).toEqual(original);
  });
});

