import { formatIngredientSpacing, formatIngredients, scaleIngredient, combineIngredients, isWaterIngredient, convertIngredientUnits, parseIngredientParts } from './ingredientUtils';

describe('formatIngredientSpacing', () => {
  describe('basic unit formatting', () => {
    test('formats ml unit', () => {
      expect(formatIngredientSpacing('100ml')).toBe('100 ml');
      expect(formatIngredientSpacing('250ml')).toBe('250 ml');
    });

    test('formats g unit', () => {
      expect(formatIngredientSpacing('100g')).toBe('100 g');
      expect(formatIngredientSpacing('250g')).toBe('250 g');
    });

    test('formats kg unit', () => {
      expect(formatIngredientSpacing('1kg')).toBe('1 kg');
      expect(formatIngredientSpacing('2kg')).toBe('2 kg');
    });

    test('formats l unit', () => {
      expect(formatIngredientSpacing('1l')).toBe('1 l');
      expect(formatIngredientSpacing('2l')).toBe('2 l');
    });

    test('formats EL unit', () => {
      expect(formatIngredientSpacing('2EL')).toBe('2 EL');
      expect(formatIngredientSpacing('3EL')).toBe('3 EL');
    });

    test('formats TL unit', () => {
      expect(formatIngredientSpacing('1TL')).toBe('1 TL');
      expect(formatIngredientSpacing('2TL')).toBe('2 TL');
    });
  });

  describe('decimal numbers', () => {
    test('formats decimal with dot', () => {
      expect(formatIngredientSpacing('1.5kg')).toBe('1.5 kg');
      expect(formatIngredientSpacing('2.5l')).toBe('2.5 l');
    });

    test('formats decimal with comma', () => {
      expect(formatIngredientSpacing('1,5kg')).toBe('1,5 kg');
      expect(formatIngredientSpacing('2,5l')).toBe('2,5 l');
    });

    test('formats small decimal values', () => {
      expect(formatIngredientSpacing('0.5kg')).toBe('0.5 kg');
      expect(formatIngredientSpacing('0,25l')).toBe('0,25 l');
    });
  });

  describe('already formatted ingredients', () => {
    test('preserves existing space between number and unit', () => {
      expect(formatIngredientSpacing('100 ml')).toBe('100 ml');
      expect(formatIngredientSpacing('250 g')).toBe('250 g');
      expect(formatIngredientSpacing('2 EL')).toBe('2 EL');
    });

    test('preserves ingredients without units', () => {
      expect(formatIngredientSpacing('1 Zwiebel')).toBe('1 Zwiebel');
      expect(formatIngredientSpacing('2 Eier')).toBe('2 Eier');
    });

    test('preserves fractions with spaces', () => {
      expect(formatIngredientSpacing('1 1/2 Tassen')).toBe('1 1/2 Tassen');
      expect(formatIngredientSpacing('2 1/4 Tassen')).toBe('2 1/4 Tassen');
    });
  });

  describe('complex ingredient strings', () => {
    test('formats unit in the middle of ingredient description', () => {
      expect(formatIngredientSpacing('100ml Milch')).toBe('100 ml Milch');
      expect(formatIngredientSpacing('250g Mehl')).toBe('250 g Mehl');
      expect(formatIngredientSpacing('2EL Öl')).toBe('2 EL Öl');
    });

    test('formats multiple ingredients on same line', () => {
      expect(formatIngredientSpacing('100ml Wasser oder 50ml Milch'))
        .toBe('100 ml Wasser oder 50 ml Milch');
    });

    test('preserves text before and after unit', () => {
      expect(formatIngredientSpacing('ca. 100ml Wasser'))
        .toBe('ca. 100 ml Wasser');
      expect(formatIngredientSpacing('etwa 250g Mehl, gesiebt'))
        .toBe('etwa 250 g Mehl, gesiebt');
    });
  });

  describe('case insensitivity', () => {
    test('handles uppercase units', () => {
      expect(formatIngredientSpacing('100ML')).toBe('100 ML');
      expect(formatIngredientSpacing('250G')).toBe('250 G');
    });

    test('handles mixed case units', () => {
      expect(formatIngredientSpacing('100Ml')).toBe('100 Ml');
      expect(formatIngredientSpacing('2El')).toBe('2 El');
      expect(formatIngredientSpacing('1Tl')).toBe('1 Tl');
    });
  });

  describe('German-specific units', () => {
    test('formats Prise', () => {
      expect(formatIngredientSpacing('1Prise')).toBe('1 Prise');
    });

    test('formats Tasse/Tassen', () => {
      expect(formatIngredientSpacing('2Tassen')).toBe('2 Tassen');
      expect(formatIngredientSpacing('1Tasse')).toBe('1 Tasse');
    });

    test('formats Becher', () => {
      expect(formatIngredientSpacing('1Becher')).toBe('1 Becher');
    });

    test('formats Stück/Stk', () => {
      expect(formatIngredientSpacing('3Stück')).toBe('3 Stück');
      expect(formatIngredientSpacing('5Stk')).toBe('5 Stk');
    });

    test('formats Bund', () => {
      expect(formatIngredientSpacing('1Bund')).toBe('1 Bund');
    });
  });

  describe('edge cases', () => {
    test('handles empty string', () => {
      expect(formatIngredientSpacing('')).toBe('');
    });

    test('handles null', () => {
      expect(formatIngredientSpacing(null)).toBe(null);
    });

    test('handles undefined', () => {
      expect(formatIngredientSpacing(undefined)).toBe(undefined);
    });

    test('handles string without numbers', () => {
      expect(formatIngredientSpacing('Salz und Pfeffer')).toBe('Salz und Pfeffer');
    });

    test('handles numbers without units', () => {
      expect(formatIngredientSpacing('Rezept für 4 Personen')).toBe('Rezept für 4 Personen');
    });

    test('handles units that are part of other words', () => {
      // Should not add space if unit is part of a larger word
      expect(formatIngredientSpacing('100 Gramm')).toBe('100 Gramm');
      expect(formatIngredientSpacing('Milch')).toBe('Milch');
    });
  });

  describe('real-world examples', () => {
    test('formats typical ingredient entries', () => {
      expect(formatIngredientSpacing('200g Mehl')).toBe('200 g Mehl');
      expect(formatIngredientSpacing('100ml Milch')).toBe('100 ml Milch');
      expect(formatIngredientSpacing('2EL Olivenöl')).toBe('2 EL Olivenöl');
      expect(formatIngredientSpacing('1TL Salz')).toBe('1 TL Salz');
      expect(formatIngredientSpacing('500g Hackfleisch')).toBe('500 g Hackfleisch');
      expect(formatIngredientSpacing('1kg Kartoffeln')).toBe('1 kg Kartoffeln');
    });

    test('preserves correctly formatted ingredients', () => {
      expect(formatIngredientSpacing('200 g Mehl')).toBe('200 g Mehl');
      expect(formatIngredientSpacing('100 ml Milch')).toBe('100 ml Milch');
      expect(formatIngredientSpacing('2 EL Olivenöl')).toBe('2 EL Olivenöl');
    });
  });
});

describe('formatIngredients', () => {
  test('formats array of ingredients', () => {
    const input = ['100ml Milch', '250g Mehl', '2EL Öl'];
    const expected = ['100 ml Milch', '250 g Mehl', '2 EL Öl'];
    expect(formatIngredients(input)).toEqual(expected);
  });

  test('handles mixed formatted and unformatted ingredients', () => {
    const input = ['100ml Milch', '250 g Mehl', '2EL Öl', '1 Ei'];
    const expected = ['100 ml Milch', '250 g Mehl', '2 EL Öl', '1 Ei'];
    expect(formatIngredients(input)).toEqual(expected);
  });

  test('handles empty array', () => {
    expect(formatIngredients([])).toEqual([]);
  });

  test('handles null', () => {
    expect(formatIngredients(null)).toBe(null);
  });

  test('handles undefined', () => {
    expect(formatIngredients(undefined)).toBe(undefined);
  });
});

describe('scaleIngredient', () => {
  test('doubles amounts when multiplier is 2', () => {
    expect(scaleIngredient('200 g Mehl', 2)).toBe('400 g Mehl');
    expect(scaleIngredient('100 ml Milch', 2)).toBe('200 ml Milch');
    expect(scaleIngredient('3 Eier', 2)).toBe('6 Eier');
  });

  test('halves amounts when multiplier is 0.5', () => {
    expect(scaleIngredient('200 g Mehl', 0.5)).toBe('100 g Mehl');
    expect(scaleIngredient('4 Eier', 0.5)).toBe('2 Eier');
  });

  test('returns ingredient unchanged when multiplier is 1', () => {
    expect(scaleIngredient('200 g Mehl', 1)).toBe('200 g Mehl');
  });

  test('handles fractions', () => {
    expect(scaleIngredient('1/2 TL Salz', 2)).toBe('1 TL Salz');
  });

  test('formats non-integer results to one decimal', () => {
    expect(scaleIngredient('100 g Mehl', 1.5)).toBe('150 g Mehl');
    expect(scaleIngredient('100 g Mehl', 3)).toBe('300 g Mehl');
  });

  test('returns null/undefined unchanged', () => {
    expect(scaleIngredient(null, 2)).toBe(null);
    expect(scaleIngredient(undefined, 2)).toBe(undefined);
  });

  test('returns empty string unchanged', () => {
    expect(scaleIngredient('', 2)).toBe('');
  });

  test('handles ingredients without numbers', () => {
    expect(scaleIngredient('Salz nach Geschmack', 2)).toBe('Salz nach Geschmack');
  });
});

describe('combineIngredients', () => {
  test('combines same ingredient with same unit', () => {
    expect(combineIngredients(['100 g Zucker', '50 g Zucker'])).toEqual(['150 g Zucker']);
  });

  test('combines same ingredient with integer result', () => {
    expect(combineIngredients(['200 g Mehl', '300 g Mehl'])).toEqual(['500 g Mehl']);
  });

  test('does not combine ingredients with different units', () => {
    expect(combineIngredients(['100 g Zucker', '50 ml Zucker'])).toEqual(['100 g Zucker', '50 ml Zucker']);
  });

  test('does not combine ingredients with different names', () => {
    expect(combineIngredients(['100 g Zucker', '100 g Salz'])).toEqual(['100 g Zucker', '100 g Salz']);
  });

  test('combines ingredients without units', () => {
    expect(combineIngredients(['2 Eier', '3 Eier'])).toEqual(['5 Eier']);
  });

  test('keeps ingredients without amounts as-is and deduplicates', () => {
    expect(combineIngredients(['Salz', 'Salz'])).toEqual(['Salz']);
  });

  test('combines case-insensitively', () => {
    expect(combineIngredients(['100 g Zucker', '50 g zucker'])).toEqual(['150 g Zucker']);
  });

  test('preserves first-appearance order', () => {
    const result = combineIngredients(['100 g Mehl', '200 g Zucker', '50 g Mehl']);
    expect(result).toEqual(['150 g Mehl', '200 g Zucker']);
  });

  test('handles empty array', () => {
    expect(combineIngredients([])).toEqual([]);
  });

  test('handles non-array input', () => {
    expect(combineIngredients(null)).toBe(null);
    expect(combineIngredients(undefined)).toBe(undefined);
  });

  test('handles ingredients with decimal result', () => {
    expect(combineIngredients(['100 g Mehl', '50.5 g Mehl'])).toEqual(['150.5 g Mehl']);
  });

  test('handles fractions', () => {
    expect(combineIngredients(['1/2 TL Salz', '1/2 TL Salz'])).toEqual(['1 TL Salz']);
  });
});

describe('isWaterIngredient', () => {
  test('detects plain "Wasser"', () => {
    expect(isWaterIngredient('Wasser')).toBe(true);
  });

  test('detects "Wasser" with amount and unit', () => {
    expect(isWaterIngredient('500 ml Wasser')).toBe(true);
    expect(isWaterIngredient('1 l Wasser')).toBe(true);
    expect(isWaterIngredient('2 Wasser')).toBe(true);
  });

  test('is case-insensitive', () => {
    expect(isWaterIngredient('wasser')).toBe(true);
    expect(isWaterIngredient('WASSER')).toBe(true);
  });

  test('does not filter other ingredients', () => {
    expect(isWaterIngredient('Mehl')).toBe(false);
    expect(isWaterIngredient('200 g Mehl')).toBe(false);
    expect(isWaterIngredient('Mineralwasser')).toBe(false);
  });
});

describe('convertIngredientUnits', () => {
  const conversionTable = [
    { id: 'oel-el', ingredient: 'Öl', unit: 'EL', grams: '', milliliters: '15' },
    { id: 'mehl-el', ingredient: 'Mehl', unit: 'EL', grams: '10', milliliters: '' },
    { id: 'salz-tl', ingredient: 'Salz', unit: 'TL', grams: '6', milliliters: '' },
    { id: 'zucker-el-empty', ingredient: 'Zucker', unit: 'EL', grams: '', milliliters: '' },
  ];

  test('converts EL to ml when milliliters entry exists', () => {
    const { converted } = convertIngredientUnits(['2 EL Öl'], conversionTable);
    expect(converted).toEqual(['30 ml Öl']);
  });

  test('converts EL to g when grams entry exists', () => {
    const { converted } = convertIngredientUnits(['3 EL Mehl'], conversionTable);
    expect(converted).toEqual(['30 g Mehl']);
  });

  test('converts TL to g', () => {
    const { converted } = convertIngredientUnits(['1 TL Salz'], conversionTable);
    expect(converted).toEqual(['6 g Salz']);
  });

  test('keeps ingredient unchanged when entry has no conversion values', () => {
    const { converted, missing } = convertIngredientUnits(['2 EL Zucker'], conversionTable);
    expect(converted).toEqual(['2 EL Zucker']);
    expect(missing).toEqual([]);
  });

  test('keeps g ingredients unchanged', () => {
    const { converted } = convertIngredientUnits(['200 g Mehl'], conversionTable);
    expect(converted).toEqual(['200 g Mehl']);
  });

  test('keeps ml ingredients unchanged', () => {
    const { converted } = convertIngredientUnits(['100 ml Milch'], conversionTable);
    expect(converted).toEqual(['100 ml Milch']);
  });

  test('converts kg to g (standard metric)', () => {
    const { converted } = convertIngredientUnits(['1 kg Kartoffeln'], []);
    expect(converted).toEqual(['1000 g Kartoffeln']);
  });

  test('converts l to ml (standard metric)', () => {
    const { converted } = convertIngredientUnits(['0.5 l Milch'], []);
    expect(converted).toEqual(['500 ml Milch']);
  });

  test('records missing entry for unknown unit+ingredient', () => {
    const { converted, missing } = convertIngredientUnits(['2 EL Öl', '1 Tasse Milch'], conversionTable);
    expect(converted[0]).toBe('30 ml Öl');
    expect(converted[1]).toBe('1 Tasse Milch');
    expect(missing).toEqual([{ unit: 'Tasse', ingredient: 'Milch' }]);
  });

  test('deduplicates missing entries', () => {
    const { missing } = convertIngredientUnits(
      ['1 Tasse Milch', '2 Tasse Milch'],
      []
    );
    expect(missing).toHaveLength(1);
    expect(missing[0]).toEqual({ unit: 'Tasse', ingredient: 'Milch' });
  });

  test('handles ingredients without amounts', () => {
    const { converted, missing } = convertIngredientUnits(['Salz'], conversionTable);
    expect(converted).toEqual(['Salz']);
    expect(missing).toEqual([]);
  });

  test('handles empty array', () => {
    const { converted, missing } = convertIngredientUnits([], conversionTable);
    expect(converted).toEqual([]);
    expect(missing).toEqual([]);
  });

  test('handles non-array input', () => {
    const result = convertIngredientUnits(null, conversionTable);
    expect(result).toEqual({ converted: null, missing: [] });
  });

  test('uses empty conversionTable when not provided', () => {
    const { missing } = convertIngredientUnits(['2 EL Öl']);
    expect(missing).toEqual([{ unit: 'EL', ingredient: 'Öl' }]);
  });

  test('formats decimal results to one decimal place', () => {
    const table = [{ id: 'x', ingredient: 'Butter', unit: 'EL', grams: '14.5', milliliters: '' }];
    const { converted } = convertIngredientUnits(['2 EL Butter'], table);
    expect(converted).toEqual(['29 g Butter']);
  });
});

describe('parseIngredientParts (async) with Teelöffel/Esslöffel', () => {
  test('parses Teelöffel correctly', async () => {
    const result = await parseIngredientParts('1 Teelöffel Salz');
    expect(result).toEqual({ amount: 1, unit: 'Teelöffel', name: 'Salz' });
  });

  test('parses Esslöffel correctly', async () => {
    const result = await parseIngredientParts('2 Esslöffel Öl');
    expect(result).toEqual({ amount: 2, unit: 'Esslöffel', name: 'Öl' });
  });

  test('parses TL correctly', async () => {
    const result = await parseIngredientParts('1 TL Salz');
    expect(result).toEqual({ amount: 1, unit: 'TL', name: 'Salz' });
  });
});

describe('convertIngredientUnits with Teelöffel/Esslöffel normalization', () => {
  const conversionTable = [
    { id: 'trueffeloel-tl', ingredient: 'Trüffelöl', unit: 'TL', grams: '', milliliters: '5' },
    { id: 'oel-el', ingredient: 'Öl', unit: 'EL', grams: '', milliliters: '15' },
  ];

  test('converts Teelöffel to ml using TL entry', () => {
    const { converted } = convertIngredientUnits(['1 Teelöffel Trüffelöl'], conversionTable);
    expect(converted).toEqual(['5 ml Trüffelöl']);
  });

  test('converts Esslöffel to ml using EL entry', () => {
    const { converted } = convertIngredientUnits(['2 Esslöffel Öl'], conversionTable);
    expect(converted).toEqual(['30 ml Öl']);
  });

  test('converts tsp to ml using TL entry', () => {
    const { converted } = convertIngredientUnits(['1 tsp Trüffelöl'], conversionTable);
    expect(converted).toEqual(['5 ml Trüffelöl']);
  });

  test('converts tbsp to ml using EL entry', () => {
    const { converted } = convertIngredientUnits(['2 tbsp Öl'], conversionTable);
    expect(converted).toEqual(['30 ml Öl']);
  });

  test('converts "teelöffel" (lowercase) to ml', () => {
    const { converted } = convertIngredientUnits(['1 teelöffel Trüffelöl'], conversionTable);
    expect(converted).toEqual(['5 ml Trüffelöl']);
  });

  test('converts "TEELÖFFEL" (uppercase) to ml', () => {
    const { converted } = convertIngredientUnits(['1 TEELÖFFEL Trüffelöl'], conversionTable);
    expect(converted).toEqual(['5 ml Trüffelöl']);
  });

  test('converts "tl" (lowercase abbreviation) to ml using TL entry', () => {
    const { converted } = convertIngredientUnits(['1 tl Trüffelöl'], conversionTable);
    expect(converted).toEqual(['5 ml Trüffelöl']);
  });

  test('converts "el" (lowercase abbreviation) to ml using EL entry', () => {
    const { converted } = convertIngredientUnits(['2 el Öl'], conversionTable);
    expect(converted).toEqual(['30 ml Öl']);
  });
});
