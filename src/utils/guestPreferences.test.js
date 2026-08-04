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

  test('computeGuestPreferenceMultipliers returns per-guest preference profiles', () => {
    const result = computeGuestPreferenceMultipliers(
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

    expect(result.perGuest).toHaveLength(2);
    expect(result.perGuest[0].preferenceFactor).toBe(1);
    expect(result.perGuest[0].allowsAlcohol).toBe(true);
    // wein's kategorie is null (string drink list), so preferredCategoryIds includes 'wein' from drinkId
    expect(result.perGuest[0].preferredDrinkIds).toContain('wein');
    expect(result.perGuest[1].preferenceFactor).toBe(0);
    expect(result.perGuest[1].allowsAlcohol).toBe(false);
  });

  test('computeGuestPreferenceMultipliers resolves bevorzugteKategorien', () => {
    const result = computeGuestPreferenceMultipliers(
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

    expect(result.perGuest).toHaveLength(1);
    expect(result.perGuest[0].preferredCategoryIds).toContain('wein_rotwein');
    expect(result.perGuest[0].preferenceFactor).toBe(1);
    expect(result.perGuest[0].allowsAlcohol).toBe(true);
  });

  test('bevorzugteKategorien parent category is included in preferredCategoryIds', () => {
    const result = computeGuestPreferenceMultipliers(
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

    expect(result.perGuest).toHaveLength(1);
    expect(result.perGuest[0].preferredCategoryIds).toContain('wein');
    expect(result.perGuest[0].preferenceFactor).toBe(1);
  });

  test('alcohol restriction is captured in allowsAlcohol flag', () => {
    const result = computeGuestPreferenceMultipliers(
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

    expect(result.perGuest).toHaveLength(1);
    expect(result.perGuest[0].allowsAlcohol).toBe(false);
    expect(result.perGuest[0].preferredCategoryIds).toContain('wein_rotwein');
  });

  test('children are excluded from perGuest array', () => {
    const result = computeGuestPreferenceMultipliers(
      [
        {
          alkoholischeGetränke: false,
          bevorzugteGetränke: [],
          präferenzFaktor: 0,
          kind: true,
        },
        {
          alkoholischeGetränke: true,
          bevorzugteGetränke: [],
          präferenzFaktor: 0,
        },
      ],
      [
        { id: 'saft-1', kategorie: 'saft' },
      ],
    );

    // Only the adult guest is included
    expect(result.perGuest).toHaveLength(1);
    expect(result.perGuest[0].allowsAlcohol).toBe(true);
  });

  test('bevorzugteGetränke resolves to correct preferredCategoryIds via drink kategorie', () => {
    const result = computeGuestPreferenceMultipliers(
      [
        {
          alkoholischeGetränke: true,
          bevorzugteGetränke: ['cola', 'fanta'],
          präferenzFaktor: 0.75,
        },
      ],
      [
        { id: 'cola', kategorie: 'softdrinks' },
        { id: 'fanta', kategorie: 'softdrinks' },
        { id: 'bier-1', kategorie: 'bier' },
      ],
    );

    expect(result.perGuest).toHaveLength(1);
    const guest = result.perGuest[0];
    expect(guest.preferenceFactor).toBe(0.75);
    expect(guest.preferredDrinkIds).toEqual(expect.arrayContaining(['cola', 'fanta']));
    expect(guest.preferredCategoryIds).toContain('softdrinks');
  });
});
