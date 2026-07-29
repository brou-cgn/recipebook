import {
  normalizePreferenceFactor,
  getGuestDisplayName,
  computeGuestPreferenceMultipliers,
} from './guestPreferences';

describe('guestPreferences', () => {
  test('normalizePreferenceFactor keeps only allowed steps', () => {
    expect(normalizePreferenceFactor(1)).toBe(1);
    expect(normalizePreferenceFactor('0.75')).toBe(0.75);
    expect(normalizePreferenceFactor(0.3)).toBe(0);
    expect(normalizePreferenceFactor('x')).toBe(0);
  });

  test('getGuestDisplayName combines first and last name', () => {
    expect(getGuestDisplayName({ vorname: 'Ada', nachname: 'Lovelace' })).toBe('Ada Lovelace');
    expect(getGuestDisplayName({ vorname: 'Ada', nachname: '' })).toBe('Ada');
    expect(getGuestDisplayName({})).toBe('');
  });

  test('computeGuestPreferenceMultipliers honors alcohol and preference factors', () => {
    const multipliers = computeGuestPreferenceMultipliers(
      [
        {
          alkoholischeGetränke: true,
          bevorzugteGetränke: ['wein'],
          präferenzFaktor: 1,
        },
        {
          alkoholischeGetränke: false,
          bevorzugteGetränke: [],
          präferenzFaktor: 0,
        },
      ],
      ['wein', 'bier', 'wasser'],
    );

    expect(multipliers.wein).toBe(0.5);
    expect(multipliers.bier).toBe(0);
    expect(multipliers.wasser).toBe(0.5);
  });
});
