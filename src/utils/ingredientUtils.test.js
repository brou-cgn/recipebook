import { formatIngredientSpacing, formatIngredients, mergeIngredients } from './ingredientUtils';

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

describe('mergeIngredients', () => {
  describe('combining identical ingredients', () => {
    test('sums quantities with the same unit', () => {
      const result = mergeIngredients(['100 g Zucker', '50 g Zucker']);
      expect(result).toEqual(['150 g Zucker']);
    });

    test('sums quantities across multiple occurrences', () => {
      const result = mergeIngredients(['100 g Mehl', '200 g Mehl', '50 g Mehl']);
      expect(result).toEqual(['350 g Mehl']);
    });

    test('sums liquid quantities', () => {
      const result = mergeIngredients(['200 ml Milch', '300 ml Milch']);
      expect(result).toEqual(['500 ml Milch']);
    });

    test('sums tablespoon quantities', () => {
      const result = mergeIngredients(['2 EL Olivenöl', '1 EL Olivenöl']);
      expect(result).toEqual(['3 EL Olivenöl']);
    });

    test('sums count ingredients (no unit)', () => {
      const result = mergeIngredients(['3 Eier', '2 Eier']);
      expect(result).toEqual(['5 Eier']);
    });

    test('deduplicates ingredients without amount', () => {
      const result = mergeIngredients(['Salz', 'Salz', 'Pfeffer']);
      expect(result).toEqual(['Salz', 'Pfeffer']);
    });
  });

  describe('case insensitivity', () => {
    test('merges ingredients regardless of name casing', () => {
      const result = mergeIngredients(['100 g Zucker', '50 g zucker']);
      expect(result).toEqual(['150 g Zucker']);
    });
  });

  describe('preserving unrelated ingredients', () => {
    test('keeps different ingredients separate', () => {
      const result = mergeIngredients(['100 g Zucker', '200 g Mehl']);
      expect(result).toEqual(['100 g Zucker', '200 g Mehl']);
    });

    test('keeps ingredients with different units separate', () => {
      const result = mergeIngredients(['100 g Zucker', '1 kg Zucker']);
      expect(result).toEqual(['100 g Zucker', '1 kg Zucker']);
    });

    test('handles mixed ingredients', () => {
      const result = mergeIngredients(['100 g Zucker', '200 g Mehl', '50 g Zucker', '3 Eier']);
      expect(result).toEqual(['150 g Zucker', '200 g Mehl', '3 Eier']);
    });
  });

  describe('edge cases', () => {
    test('returns empty array for empty input', () => {
      expect(mergeIngredients([])).toEqual([]);
    });

    test('returns single item unchanged', () => {
      expect(mergeIngredients(['100 g Mehl'])).toEqual(['100 g Mehl']);
    });

    test('handles null/undefined in array', () => {
      const result = mergeIngredients(['100 g Mehl', null, undefined, '50 g Mehl']);
      expect(result).toEqual(['150 g Mehl']);
    });

    test('returns non-array input unchanged', () => {
      expect(mergeIngredients(null)).toBe(null);
      expect(mergeIngredients(undefined)).toBe(undefined);
    });
  });
});
