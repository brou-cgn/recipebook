import {
  getSavedSections,
  getDefaultSections,
  saveSectionName,
  saveSectionNames,
  groupRecipesBySections,
  createMenuSection,
  validateMenuSections
} from './menuSections';

// Clear localStorage before each test
beforeEach(() => {
  localStorage.clear();
});

describe('menuSections utility functions', () => {
  describe('getDefaultSections', () => {
    test('returns array of default section names', () => {
      const sections = getDefaultSections();
      expect(Array.isArray(sections)).toBe(true);
      expect(sections.length).toBeGreaterThan(0);
      expect(sections).toContain('Vorspeise');
      expect(sections).toContain('Hauptspeise');
      expect(sections).toContain('Dessert');
    });
  });

  describe('getSavedSections', () => {
    test('returns default sections when none are saved', () => {
      const sections = getSavedSections();
      const defaults = getDefaultSections();
      expect(sections).toEqual(defaults);
    });

    test('returns saved sections when they exist', () => {
      const customSections = ['Custom 1', 'Custom 2'];
      localStorage.setItem('menuSections', JSON.stringify(customSections));
      expect(getSavedSections()).toEqual(customSections);
    });
  });

  describe('saveSectionName', () => {
    test('saves a new section name', () => {
      const result = saveSectionName('Fingerfood');
      expect(result).toBe(true);
      expect(getSavedSections()).toContain('Fingerfood');
    });

    test('does not add duplicate sections (case-insensitive)', () => {
      saveSectionName('Vorspeise');
      saveSectionName('vorspeise');
      const sections = getSavedSections();
      const vorspeiseCount = sections.filter(s => s.toLowerCase() === 'vorspeise').length;
      expect(vorspeiseCount).toBe(1);
    });

    test('returns false for invalid input', () => {
      expect(saveSectionName('')).toBe(false);
      expect(saveSectionName('   ')).toBe(false);
      expect(saveSectionName(null)).toBe(false);
      expect(saveSectionName(undefined)).toBe(false);
    });

    test('trims whitespace from section name', () => {
      saveSectionName('  Amuse-Bouche  ');
      const sections = getSavedSections();
      expect(sections).toContain('Amuse-Bouche');
      expect(sections).not.toContain('  Amuse-Bouche  ');
    });
  });

  describe('saveSectionNames', () => {
    test('saves multiple section names', () => {
      const result = saveSectionNames(['Section 1', 'Section 2', 'Section 3']);
      expect(result).toBe(true);
      const sections = getSavedSections();
      expect(sections).toContain('Section 1');
      expect(sections).toContain('Section 2');
      expect(sections).toContain('Section 3');
    });

    test('returns false for invalid input', () => {
      expect(saveSectionNames(null)).toBe(false);
      expect(saveSectionNames('not an array')).toBe(false);
    });
  });

  describe('createMenuSection', () => {
    test('creates a section with name and recipe IDs', () => {
      const section = createMenuSection('Vorspeise', ['recipe1', 'recipe2']);
      expect(section).toEqual({
        name: 'Vorspeise',
        recipeIds: ['recipe1', 'recipe2']
      });
    });

    test('creates a section with empty recipe list by default', () => {
      const section = createMenuSection('Hauptspeise');
      expect(section).toEqual({
        name: 'Hauptspeise',
        recipeIds: []
      });
    });

    test('trims section name', () => {
      const section = createMenuSection('  Dessert  ');
      expect(section.name).toBe('Dessert');
    });
  });

  describe('groupRecipesBySections', () => {
    const recipes = [
      { id: 'recipe1', title: 'Recipe 1' },
      { id: 'recipe2', title: 'Recipe 2' },
      { id: 'recipe3', title: 'Recipe 3' }
    ];

    test('groups recipes by sections', () => {
      const menuSections = [
        { name: 'Vorspeise', recipeIds: ['recipe1'] },
        { name: 'Hauptspeise', recipeIds: ['recipe2', 'recipe3'] }
      ];

      const grouped = groupRecipesBySections(menuSections, recipes);
      
      expect(grouped).toHaveLength(2);
      expect(grouped[0].name).toBe('Vorspeise');
      expect(grouped[0].recipes).toHaveLength(1);
      expect(grouped[0].recipes[0].id).toBe('recipe1');
      
      expect(grouped[1].name).toBe('Hauptspeise');
      expect(grouped[1].recipes).toHaveLength(2);
    });

    test('returns empty array for invalid input', () => {
      expect(groupRecipesBySections(null, recipes)).toEqual([]);
      expect(groupRecipesBySections([], null)).toEqual([]);
      expect(groupRecipesBySections('not an array', recipes)).toEqual([]);
    });

    test('handles sections with no matching recipes', () => {
      const menuSections = [
        { name: 'Vorspeise', recipeIds: ['nonexistent'] }
      ];

      const grouped = groupRecipesBySections(menuSections, recipes);
      expect(grouped[0].recipes).toHaveLength(0);
    });
  });

  describe('validateMenuSections', () => {
    test('validates correct section structure', () => {
      const sections = [
        { name: 'Vorspeise', recipeIds: ['recipe1'] },
        { name: 'Hauptspeise', recipeIds: [] }
      ];
      expect(validateMenuSections(sections)).toBe(true);
    });

    test('rejects invalid input', () => {
      expect(validateMenuSections(null)).toBe(false);
      expect(validateMenuSections('not an array')).toBe(false);
      expect(validateMenuSections([])).toBe(false);
    });

    test('rejects sections with missing name', () => {
      const sections = [
        { recipeIds: ['recipe1'] }
      ];
      expect(validateMenuSections(sections)).toBe(false);
    });

    test('rejects sections with empty name', () => {
      const sections = [
        { name: '', recipeIds: [] }
      ];
      expect(validateMenuSections(sections)).toBe(false);
    });

    test('rejects sections with invalid recipeIds', () => {
      const sections = [
        { name: 'Vorspeise', recipeIds: 'not an array' }
      ];
      expect(validateMenuSections(sections)).toBe(false);
    });
  });
});
