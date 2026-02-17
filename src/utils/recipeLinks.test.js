import { 
  encodeRecipeLink, 
  decodeRecipeLink, 
  isRecipeLink, 
  extractRecipeLinks,
  startsWithHash 
} from './recipeLinks';

describe('recipeLinks utilities', () => {
  describe('encodeRecipeLink', () => {
    test('encodes recipe link correctly', () => {
      const result = encodeRecipeLink('abc123', 'Tomatensoße');
      expect(result).toBe('#recipe:abc123:Tomatensoße');
    });

    test('handles recipe names with special characters', () => {
      const result = encodeRecipeLink('xyz789', 'Käse-Spätzle & Salat');
      expect(result).toBe('#recipe:xyz789:Käse-Spätzle & Salat');
    });
  });

  describe('decodeRecipeLink', () => {
    test('decodes valid recipe link', () => {
      const result = decodeRecipeLink('#recipe:abc123:Tomatensoße');
      expect(result).toEqual({
        recipeId: 'abc123',
        recipeName: 'Tomatensoße'
      });
    });

    test('handles recipe names with colons', () => {
      const result = decodeRecipeLink('#recipe:xyz789:Sauce: Tomaten-Basilikum');
      expect(result).toEqual({
        recipeId: 'xyz789',
        recipeName: 'Sauce: Tomaten-Basilikum'
      });
    });

    test('returns null for invalid format', () => {
      expect(decodeRecipeLink('regular ingredient')).toBeNull();
      expect(decodeRecipeLink('#notarecipe')).toBeNull();
      expect(decodeRecipeLink('')).toBeNull();
      expect(decodeRecipeLink(null)).toBeNull();
    });
  });

  describe('isRecipeLink', () => {
    test('returns true for valid recipe links', () => {
      expect(isRecipeLink('#recipe:abc123:Tomatensoße')).toBe(true);
      expect(isRecipeLink('#recipe:xyz:Name')).toBe(true);
    });

    test('returns false for non-recipe-link strings', () => {
      expect(isRecipeLink('200g Mehl')).toBe(false);
      expect(isRecipeLink('#hashtag')).toBe(false);
      expect(isRecipeLink('')).toBe(false);
      expect(isRecipeLink(null)).toBe(false);
    });
  });

  describe('extractRecipeLinks', () => {
    test('extracts all recipe links from ingredients array', () => {
      const ingredients = [
        '200g Mehl',
        '#recipe:abc123:Tomatensoße',
        '3 Eier',
        '#recipe:xyz789:Pizzateig'
      ];

      const result = extractRecipeLinks(ingredients);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ recipeId: 'abc123', recipeName: 'Tomatensoße' });
      expect(result[1]).toEqual({ recipeId: 'xyz789', recipeName: 'Pizzateig' });
    });

    test('returns empty array when no recipe links present', () => {
      const ingredients = ['200g Mehl', '3 Eier', '1 TL Salz'];
      const result = extractRecipeLinks(ingredients);
      expect(result).toEqual([]);
    });

    test('handles empty or invalid input', () => {
      expect(extractRecipeLinks([])).toEqual([]);
      expect(extractRecipeLinks(null)).toEqual([]);
      expect(extractRecipeLinks(undefined)).toEqual([]);
    });
  });

  describe('startsWithHash', () => {
    test('returns true for strings starting with #', () => {
      expect(startsWithHash('#recipe')).toBe(true);
      expect(startsWithHash('#anything')).toBe(true);
      expect(startsWithHash('  #whitespace')).toBe(true);
    });

    test('returns false for strings not starting with #', () => {
      expect(startsWithHash('normal text')).toBe(false);
      expect(startsWithHash('has # in middle')).toBe(false);
      expect(startsWithHash('')).toBe(false);
      expect(startsWithHash(null)).toBe(false);
    });
  });
});
