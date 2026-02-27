/**
 * Tests for customLists utility – AI prompt migration logic
 */

// Mock Firebase modules before importing customLists
jest.mock('../firebase', () => ({ db: {} }));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((...args) => ({ path: args.slice(1).join('/') })),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
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
} from './customLists';
import { getDoc, updateDoc, doc } from 'firebase/firestore';

const mockGetDoc = getDoc;
const mockUpdateDoc = updateDoc;

beforeEach(() => {
  // Only clear call history on specific mocks; clearAllMocks() would also wipe
  // the doc() implementation which is needed by the module under test
  getDoc.mockClear();
  updateDoc.mockClear();
  // Restore doc() implementation in case it was wiped by a previous reset
  doc.mockImplementation((...args) => ({ path: args.slice(1).join('/') }));
  clearSettingsCache();
});

describe('getSettings – AI prompt migration', () => {
  test('keeps a valid prompt that already contains both placeholders', async () => {
    const validPrompt = 'Use {{CUISINE_TYPES}} and {{MEAL_CATEGORIES}} here';
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
});
