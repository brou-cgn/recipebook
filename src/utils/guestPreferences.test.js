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

  test('computeGuestPreferenceMultipliers honors bevorzugteKategorien with drink objects', () => {
    const multipliers = computeGuestPreferenceMultipliers(
      [
        {
          alkoholischeGetränke: true,
          bevorzugteGetränke: [],
          bevorzugteKategorien: ['wein_rotwein'],
          präferenzFaktor: 1,
        },
      ],
      [
        { id: 'hauswein', kategorie: 'wein_rotwein' },
        { id: 'weisswein', kategorie: 'wein_weisswein' },
        { id: 'wasser', kategorie: 'wasser' },
      ],
    );

    expect(multipliers.hauswein).toBe(1);
    expect(multipliers.weisswein).toBe(0);
    expect(multipliers.wasser).toBe(0);
  });

  test('bevorzugteKategorien parent category also matches subcategory drinks', () => {
    const multipliers = computeGuestPreferenceMultipliers(
      [
        {
          alkoholischeGetränke: true,
          bevorzugteGetränke: [],
          bevorzugteKategorien: ['wein'],
          präferenzFaktor: 1,
        },
      ],
      [
        { id: 'rotwein-1', kategorie: 'wein_rotwein' },
        { id: 'weisswein-1', kategorie: 'wein_weisswein' },
        { id: 'bier-1', kategorie: 'bier' },
      ],
    );

    expect(multipliers['rotwein-1']).toBe(1);
    expect(multipliers['weisswein-1']).toBe(1);
    expect(multipliers['bier-1']).toBe(0);
  });

  test('alcohol restriction overrides category preference for alcoholic drinks', () => {
    const multipliers = computeGuestPreferenceMultipliers(
      [
        {
          alkoholischeGetränke: false,
          bevorzugteGetränke: [],
          bevorzugteKategorien: ['wein_rotwein'],
          präferenzFaktor: 1,
        },
      ],
      [
        { id: 'rotwein-1', kategorie: 'wein_rotwein' },
        { id: 'wasser-1', kategorie: 'wasser' },
      ],
    );

    expect(multipliers['rotwein-1']).toBe(0);
    expect(multipliers['wasser-1']).toBe(0);
  });

  test('alcoholic subcategory drink is blocked when alkohol is false', () => {
    const multipliers = computeGuestPreferenceMultipliers(
      [
        {
          alkoholischeGetränke: false,
          bevorzugteGetränke: [],
          präferenzFaktor: 0,
        },
      ],
      [
        { id: 'pils-1', kategorie: 'bier_pils' },
        { id: 'saft-1', kategorie: 'saft' },
      ],
    );

    expect(multipliers['pils-1']).toBe(0);
    expect(multipliers['saft-1']).toBe(1);
  });
});
