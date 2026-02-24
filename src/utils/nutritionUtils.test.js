import { mapNutritionCalcError } from './nutritionUtils';

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
