/**
 * Tests for customLists utility – AI prompt migration logic
 */

// Mock Firebase modules before importing customLists
jest.mock('../firebase', () => ({ db: {} }));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((...args) => ({ path: args.slice(1).join('/') })),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteField: jest.fn(() => ({ _methodName: 'FieldValue.delete' })),
  collection: jest.fn((db, name) => ({ id: name })),
  writeBatch: jest.fn(),
  serverTimestamp: jest.fn(() => ({ _methodName: 'FieldValue.serverTimestamp' })),
}));

import {
  getSettings,
  getCustomLists,
  clearSettingsCache,
  DEFAULT_AI_RECIPE_PROMPT,
  DEFAULT_CUISINE_TYPES,
  DEFAULT_MEAL_CATEGORIES,
  DEFAULT_UNITS,
  DEFAULT_PORTION_UNITS,
  DEFAULT_CONVERSION_TABLE,
  expandCuisineSelection,
  getParentCuisineNames,
} from './customLists';
import { getDoc, getDocs, updateDoc, setDoc, doc, writeBatch } from 'firebase/firestore';

const mockBatch = {
  set: jest.fn(),
  commit: jest.fn().mockResolvedValue(undefined),
};

const mockGetDoc = getDoc;
const mockUpdateDoc = updateDoc;

beforeEach(() => {
  // Only clear call history on specific mocks; clearAllMocks() would also wipe
  // the doc() implementation which is needed by the module under test
  getDoc.mockClear();
  getDocs.mockClear();
  updateDoc.mockClear();
  setDoc.mockClear();
  mockBatch.set.mockClear();
  mockBatch.commit.mockClear();
  writeBatch.mockClear();
  writeBatch.mockReturnValue(mockBatch);
  // Restore doc() implementation in case it was wiped by a previous reset
  doc.mockImplementation((...args) => ({ path: args.slice(1).join('/') }));
  // Default: getDocs returns an empty snapshot (no icons in collection)
  getDocs.mockResolvedValue({ forEach: jest.fn() });
  clearSettingsCache();
});

describe('getSettings – AI prompt migration', () => {
  test('keeps a valid prompt that already contains both placeholders', async () => {
    const validPrompt = 'Use {{CUISINE_TYPES}} and {{MEAL_CATEGORIES}} here.';
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ aiRecipePrompt: validPrompt }),
    });

    const settings = await getSettings();

    expect(settings.aiRecipePrompt).toBe(validPrompt);
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  test('migrates a prompt that is missing {{CUISINE_TYPES}}', async () => {
    const oldPrompt = 'A prompt with only {{MEAL_CATEGORIES}} but no cuisine placeholder';
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ aiRecipePrompt: oldPrompt }),
    });
    mockUpdateDoc.mockResolvedValue(undefined);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const settings = await getSettings();
    warnSpy.mockRestore();

    expect(settings.aiRecipePrompt).toBe(DEFAULT_AI_RECIPE_PROMPT);
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      { aiRecipePrompt: DEFAULT_AI_RECIPE_PROMPT }
    );
  });

  test('migrates a prompt that is missing {{MEAL_CATEGORIES}}', async () => {
    const oldPrompt = 'A prompt with only {{CUISINE_TYPES}} but no meal categories';
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ aiRecipePrompt: oldPrompt }),
    });
    mockUpdateDoc.mockResolvedValue(undefined);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const settings = await getSettings();
    warnSpy.mockRestore();

    expect(settings.aiRecipePrompt).toBe(DEFAULT_AI_RECIPE_PROMPT);
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      { aiRecipePrompt: DEFAULT_AI_RECIPE_PROMPT }
    );
  });

  test('migrates when stored prompt is missing both placeholders', async () => {
    const oldPrompt = 'An old prompt with no placeholders at all';
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ aiRecipePrompt: oldPrompt }),
    });
    mockUpdateDoc.mockResolvedValue(undefined);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const settings = await getSettings();
    warnSpy.mockRestore();

    expect(settings.aiRecipePrompt).toBe(DEFAULT_AI_RECIPE_PROMPT);
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      { aiRecipePrompt: DEFAULT_AI_RECIPE_PROMPT }
    );
  });

  test('does not migrate a prompt that has both placeholders but is missing fraction-to-decimal rule', async () => {
    const promptWithoutFractionRule = 'Use {{CUISINE_TYPES}} and {{MEAL_CATEGORIES}} here but no fraction rule';
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ aiRecipePrompt: promptWithoutFractionRule }),
    });

    const settings = await getSettings();

    expect(settings.aiRecipePrompt).toBe(promptWithoutFractionRule);
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  test('falls back to default without a Firestore write when aiRecipePrompt is absent', async () => {
    // No aiRecipePrompt field – falls back to DEFAULT which already has placeholders,
    // so no migration (updateDoc) should be triggered
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({}),
    });

    const settings = await getSettings();

    expect(settings.aiRecipePrompt).toBe(DEFAULT_AI_RECIPE_PROMPT);
    // DEFAULT already contains both placeholders, so no migration write needed
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  test('does not call updateDoc when Firestore read fails (catch branch)', async () => {
    mockGetDoc.mockRejectedValue(new Error('Network error'));

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const settings = await getSettings();
    errorSpy.mockRestore();

    expect(settings.aiRecipePrompt).toBe(DEFAULT_AI_RECIPE_PROMPT);
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });
});

describe('getCustomLists – default fallbacks', () => {
  test('returns defaults when settings fields are missing', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ aiRecipePrompt: DEFAULT_AI_RECIPE_PROMPT }),
    });

    const lists = await getCustomLists();

    expect(lists.cuisineTypes).toEqual(DEFAULT_CUISINE_TYPES);
    expect(lists.mealCategories).toEqual(DEFAULT_MEAL_CATEGORIES);
    expect(lists.units).toEqual(DEFAULT_UNITS);
    expect(lists.portionUnits).toEqual(DEFAULT_PORTION_UNITS);
    expect(lists.conversionTable).toEqual(DEFAULT_CONVERSION_TABLE);
  });

  test('returns custom values when present in Firestore', async () => {
    const customCuisine = ['Italian', 'Thai'];
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        cuisineTypes: customCuisine,
        aiRecipePrompt: DEFAULT_AI_RECIPE_PROMPT,
      }),
    });

    const lists = await getCustomLists();

    expect(lists.cuisineTypes).toEqual(customCuisine);
  });

  test('returns saved portionUnits from Firestore instead of defaults', async () => {
    const savedPortionUnits = [
      { id: 'portion', singular: 'Portion', plural: 'Portionen' },
      { id: 'pizza', singular: 'Pizza', plural: 'Pizzen' },
      { id: 'neue-einheit', singular: 'Neue Einheit', plural: 'Neue Einheiten' },
    ];
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        portionUnits: savedPortionUnits,
        aiRecipePrompt: DEFAULT_AI_RECIPE_PROMPT,
      }),
    });

    const lists = await getCustomLists();

    expect(lists.portionUnits).toEqual(savedPortionUnits);
    expect(lists.portionUnits).toHaveLength(3);
    expect(lists.portionUnits[2].id).toBe('neue-einheit');
  });

  test('includes customUnits from Firestore in the returned lists', async () => {
    const savedCustomUnits = ['myUnit', 'anotherUnit'];
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        customUnits: savedCustomUnits,
        aiRecipePrompt: DEFAULT_AI_RECIPE_PROMPT,
      }),
    });

    const lists = await getCustomLists();

    expect(lists.customUnits).toEqual(savedCustomUnits);
  });

  test('customUnits defaults to empty array when not in Firestore', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ aiRecipePrompt: DEFAULT_AI_RECIPE_PROMPT }),
    });

    const lists = await getCustomLists();

    expect(lists.customUnits).toEqual([]);
  });
});

describe('expandCuisineSelection', () => {
  const cuisineGroups = [
    { name: 'Asiatische Küche', children: ['Japanisch', 'Thailändisch', 'Chinesisch'] },
    { name: 'Europäische Küche', children: ['Italienisch', 'Deutsch'] },
  ];

  test('returns empty array when selectedCuisines is empty', () => {
    expect(expandCuisineSelection([], cuisineGroups)).toEqual([]);
  });

  test('returns empty array when selectedCuisines is null', () => {
    expect(expandCuisineSelection(null, cuisineGroups)).toEqual([]);
  });

  test('passes through leaf types unchanged', () => {
    const result = expandCuisineSelection(['Italienisch'], cuisineGroups);
    expect(result).toEqual(['Italienisch']);
  });

  test('expands parent group to the group name itself and all its children', () => {
    const result = expandCuisineSelection(['Asiatische Küche'], cuisineGroups);
    expect(result).toEqual(expect.arrayContaining(['Asiatische Küche', 'Japanisch', 'Thailändisch', 'Chinesisch']));
    expect(result).toHaveLength(4);
  });

  test('combines expanded parent children with selected leaf types', () => {
    const result = expandCuisineSelection(['Asiatische Küche', 'Deutsch'], cuisineGroups);
    expect(result).toEqual(expect.arrayContaining(['Asiatische Küche', 'Japanisch', 'Thailändisch', 'Chinesisch', 'Deutsch']));
  });

  test('recursively expands nested groups', () => {
    const nestedGroups = [
      { name: 'Alle asiatischen', children: ['Ostasiatisch', 'Südostasiatisch'] },
      { name: 'Ostasiatisch', children: ['Japanisch', 'Chinesisch'] },
      { name: 'Südostasiatisch', children: ['Thailändisch', 'Vietnamesisch'] },
    ];
    const result = expandCuisineSelection(['Alle asiatischen'], nestedGroups);
    expect(result).toEqual(expect.arrayContaining([
      'Alle asiatischen', 'Ostasiatisch', 'Südostasiatisch', 'Japanisch', 'Chinesisch', 'Thailändisch', 'Vietnamesisch',
    ]));
    expect(result).toHaveLength(7);
  });

  test('handles circular references without infinite loop', () => {
    const circularGroups = [
      { name: 'Gruppe A', children: ['Gruppe B'] },
      { name: 'Gruppe B', children: ['Gruppe A'] },
    ];
    const result = expandCuisineSelection(['Gruppe A'], circularGroups);
    expect(result).toEqual(expect.arrayContaining(['Gruppe A', 'Gruppe B']));
    expect(result).toHaveLength(2);
  });

  test('deduplicates when a child is selected both directly and via parent', () => {
    const result = expandCuisineSelection(['Asiatische Küche', 'Japanisch'], cuisineGroups);
    const japanischCount = result.filter(c => c === 'Japanisch').length;
    expect(japanischCount).toBe(1);
  });

  test('returns leaf types unchanged when cuisineGroups is empty', () => {
    const result = expandCuisineSelection(['Italienisch', 'Deutsch'], []);
    expect(result).toEqual(['Italienisch', 'Deutsch']);
  });

  test('returns leaf types unchanged when cuisineGroups is null', () => {
    const result = expandCuisineSelection(['Italienisch'], null);
    expect(result).toEqual(['Italienisch']);
  });
});

describe('getParentCuisineNames', () => {
  test('returns empty set when cuisineGroups is empty', () => {
    expect(getParentCuisineNames([])).toEqual(new Set());
  });

  test('returns set of parent names', () => {
    const groups = [
      { name: 'Asiatische Küche', children: ['Japanisch'] },
      { name: 'Europäische Küche', children: ['Italienisch'] },
    ];
    const result = getParentCuisineNames(groups);
    expect(result).toEqual(new Set(['Asiatische Küche', 'Europäische Küche']));
  });

  test('returns empty set when cuisineGroups is null', () => {
    expect(getParentCuisineNames(null)).toEqual(new Set());
  });
});

describe('getSettings – settings/images document split', () => {
  test('reads image data from settings/images when available', async () => {
    getDoc.mockImplementation((docRef) => {
      if (docRef.path === 'settings/images') {
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            faviconImage: 'data:image/png;base64,abc123',
            appLogoImage: null,
            timelineBubbleIcon: 'data:image/png;base64,bubble',
            // buttonIcons is no longer stored in settings/images
          }),
        });
      }
      return Promise.resolve({
        exists: () => true,
        data: () => ({ aiRecipePrompt: DEFAULT_AI_RECIPE_PROMPT }),
      });
    });
    // Simulate cookingMode icon in the buttonIcons collection
    getDocs.mockResolvedValue({
      forEach: (cb) => cb({ id: 'cookingMode', data: () => ({ value: '🍳' }) }),
    });

    const settings = await getSettings();

    expect(settings.faviconImage).toBe('data:image/png;base64,abc123');
    expect(settings.appLogoImage).toBeNull();
    expect(settings.buttonIcons.cookingMode).toBe('🍳');
    expect(settings.timelineBubbleIcon).toBe('data:image/png;base64,bubble');
  });

  test('returns null image defaults when settings/images does not exist', async () => {
    getDoc.mockImplementation((docRef) => {
      if (docRef.path === 'settings/images') {
        return Promise.resolve({ exists: () => false });
      }
      return Promise.resolve({
        exists: () => true,
        data: () => ({ aiRecipePrompt: DEFAULT_AI_RECIPE_PROMPT }),
      });
    });

    const settings = await getSettings();

    expect(settings.faviconImage).toBeNull();
    expect(settings.appLogoImage).toBeNull();
    expect(settings.buttonIcons).toEqual(expect.objectContaining({ cookingMode: '👨‍🍳' }));
  });

  test('migrates image fields from settings/app to settings/images', async () => {
    const faviconBase64 = 'data:image/png;base64,migrated';
    const mockButtonIcons = { cookingMode: '🍳' };

    getDoc.mockImplementation((docRef) => {
      if (docRef.path === 'settings/images') {
        return Promise.resolve({ exists: () => false });
      }
      return Promise.resolve({
        exists: () => true,
        data: () => ({
          aiRecipePrompt: DEFAULT_AI_RECIPE_PROMPT,
          faviconImage: faviconBase64,
          buttonIcons: mockButtonIcons,
        }),
      });
    });
    setDoc.mockResolvedValue(undefined);
    updateDoc.mockResolvedValue(undefined);

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const settings = await getSettings();
    logSpy.mockRestore();

    // Image data should appear in the returned settings
    expect(settings.faviconImage).toBe(faviconBase64);
    // buttonIcons migrated from settings/app → collection; getDocs returns empty → DEFAULT_BUTTON_ICONS used
    expect(settings.buttonIcons).toEqual(expect.objectContaining({ cookingMode: '👨‍🍳' }));

    // setDoc should have been called to create settings/images with faviconImage only
    // (buttonIcons is no longer stored in settings/images)
    expect(setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'settings/images' }),
      expect.objectContaining({ faviconImage: faviconBase64 })
    );
    // buttonIcons must NOT be written to settings/images
    expect(setDoc).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: 'settings/images' }),
      expect.objectContaining({ buttonIcons: expect.anything() })
    );

    // writeBatch should have been used to migrate buttonIcons to the collection
    expect(mockBatch.set).toHaveBeenCalled();
    expect(mockBatch.commit).toHaveBeenCalled();

    // updateDoc should have been called to remove faviconImage from settings/app
    const updateCalls = updateDoc.mock.calls;
    const appDeleteCalls = updateCalls.filter(call => call[0]?.path === 'settings/app');
    expect(appDeleteCalls.length).toBeGreaterThan(0);
    const allAppDeleteKeys = appDeleteCalls.flatMap(call => Object.keys(call[1]));
    expect(allAppDeleteKeys).toContain('faviconImage');
    // buttonIcons is also removed from settings/app via the buttonIcons migration
    expect(allAppDeleteKeys).toContain('buttonIcons');
  });

  test('migrates buttonIcons from settings/images to buttonIcons collection', async () => {
    const mockButtonIcons = { cookingMode: '🍳' };

    getDoc.mockImplementation((docRef) => {
      if (docRef.path === 'settings/images') {
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            faviconImage: null,
            buttonIcons: mockButtonIcons,
          }),
        });
      }
      return Promise.resolve({
        exists: () => true,
        data: () => ({ aiRecipePrompt: DEFAULT_AI_RECIPE_PROMPT }),
      });
    });
    updateDoc.mockResolvedValue(undefined);

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await getSettings();
    logSpy.mockRestore();

    // writeBatch should have been used to migrate buttonIcons to the collection
    expect(mockBatch.set).toHaveBeenCalled();
    expect(mockBatch.commit).toHaveBeenCalled();

    // buttonIcons should be removed from settings/images
    const updateCalls = updateDoc.mock.calls;
    const imagesDeleteCall = updateCalls.find(call => call[0]?.path === 'settings/images');
    expect(imagesDeleteCall).toBeDefined();
    expect(Object.keys(imagesDeleteCall[1])).toContain('buttonIcons');
  });

  test('does not migrate when no image fields are present in settings/app', async () => {
    getDoc.mockImplementation((docRef) => {
      if (docRef.path === 'settings/images') {
        return Promise.resolve({ exists: () => false });
      }
      return Promise.resolve({
        exists: () => true,
        data: () => ({ aiRecipePrompt: DEFAULT_AI_RECIPE_PROMPT }),
      });
    });

    const settings = await getSettings();

    // No migration calls
    expect(setDoc).not.toHaveBeenCalled();
    // updateDoc not called (no AI prompt migration and no image migration)
    expect(updateDoc).not.toHaveBeenCalled();
    expect(settings.faviconImage).toBeNull();
  });
});
