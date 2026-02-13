import { fuzzyScore, fuzzyFilter } from './fuzzySearch';

describe('fuzzySearch utilities', () => {
  describe('fuzzyScore', () => {
    test('returns 0 for empty string or query', () => {
      expect(fuzzyScore('', 'test')).toBe(0);
      expect(fuzzyScore('test', '')).toBe(0);
      expect(fuzzyScore('', '')).toBe(0);
    });

    test('returns highest score for exact match', () => {
      const exactScore = fuzzyScore('test', 'test');
      const startsWithScore = fuzzyScore('testing', 'test');
      const containsScore = fuzzyScore('my test', 'test');
      
      expect(exactScore).toBeGreaterThan(startsWithScore);
      expect(exactScore).toBeGreaterThan(containsScore);
      expect(exactScore).toBe(1000);
    });

    test('returns high score for starts with match', () => {
      const startsWithScore = fuzzyScore('spaghetti', 'spa');
      const containsScore = fuzzyScore('my spaghetti', 'spa');
      
      expect(startsWithScore).toBeGreaterThan(containsScore);
      expect(startsWithScore).toBe(500);
    });

    test('returns medium score for contains match', () => {
      const score = fuzzyScore('my spaghetti', 'spa');
      expect(score).toBe(300);
    });

    test('is case insensitive', () => {
      expect(fuzzyScore('Test', 'test')).toBe(1000);
      expect(fuzzyScore('TEST', 'test')).toBe(1000);
      expect(fuzzyScore('TeSt', 'TeSt')).toBe(1000);
    });

    test('fuzzy matches characters in order', () => {
      // 'spa' matches 'Spaghetti' - s, p, a appear in order
      const score = fuzzyScore('Spaghetti', 'spa');
      expect(score).toBeGreaterThan(0);
      
      // 'spg' matches 'Spaghetti' - s, p, g appear in order
      const score2 = fuzzyScore('Spaghetti', 'spg');
      expect(score2).toBeGreaterThan(0);
      
      // 'sgp' does not match 'Spaghetti' - g comes before p
      const score3 = fuzzyScore('Spaghetti', 'sgp');
      expect(score3).toBe(0);
    });

    test('gives higher scores to more compact matches', () => {
      // 'abc' in 'abc123' is more compact than in 'a1b2c3'
      const compactScore = fuzzyScore('abc123', 'abc');
      const dispersedScore = fuzzyScore('a1b2c3', 'abc');
      
      expect(compactScore).toBeGreaterThan(dispersedScore);
    });

    test('gives higher scores to matches at the beginning', () => {
      // Both contain 'abc', but one starts with it
      const startScore = fuzzyScore('abc123', 'abc');
      const middleScore = fuzzyScore('123abc', 'abc');
      
      expect(startScore).toBeGreaterThan(middleScore);
    });
  });

  describe('fuzzyFilter', () => {
    const items = [
      { id: 1, name: 'Spaghetti Carbonara' },
      { id: 2, name: 'Classic Margherita Pizza' },
      { id: 3, name: 'Chocolate Chip Cookies' },
      { id: 4, name: 'Caesar Salad' },
      { id: 5, name: 'Banana Bread' }
    ];

    const getName = (item) => item.name;

    test('returns all items when query is empty', () => {
      expect(fuzzyFilter(items, '', getName)).toEqual(items);
      expect(fuzzyFilter(items, '   ', getName)).toEqual(items);
    });

    test('filters items based on fuzzy match', () => {
      const results = fuzzyFilter(items, 'spa', getName);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(item => item.name.includes('Spaghetti'))).toBe(true);
    });

    test('sorts results by score (best match first)', () => {
      const results = fuzzyFilter(items, 'c', getName);
      // Items with 'c' at the start should come first
      expect(results[0].name).toMatch(/^C/);
    });

    test('returns empty array when no matches', () => {
      const results = fuzzyFilter(items, 'xyz123', getName);
      expect(results).toEqual([]);
    });

    test('is case insensitive', () => {
      const results1 = fuzzyFilter(items, 'SPAGHETTI', getName);
      const results2 = fuzzyFilter(items, 'spaghetti', getName);
      expect(results1.length).toBe(results2.length);
      expect(results1.length).toBeGreaterThan(0);
    });

    test('handles partial matches', () => {
      // 'choc' should match 'Chocolate Chip Cookies'
      const results = fuzzyFilter(items, 'choc', getName);
      expect(results.some(item => item.name.includes('Chocolate'))).toBe(true);
    });

    test('handles fuzzy character matching', () => {
      // 'ccc' should match 'Chocolate Chip Cookies' (C, C, C in order)
      const results = fuzzyFilter(items, 'ccc', getName);
      expect(results.some(item => item.name.includes('Chocolate Chip Cookies'))).toBe(true);
    });
  });
});
