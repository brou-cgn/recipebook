/**
 * Tests for the webImportService helper utilities,
 * focusing on the recipeImportPage direct-parse path.
 */

// Mock firebase and firebase/functions so the module can be imported in Jest
jest.mock('../firebase', () => ({ functions: {} }));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn() }));

// Mock the OCR parser so we can control its output in unit tests
jest.mock('./ocrParser', () => ({
  parseOcrTextSmart: jest.fn(),
}));

import { isRecipeImportPageUrl, parseRecipeImportPage } from './webImportService';
import { parseOcrTextSmart } from './ocrParser';

// --------------------------------------------------------------------------
// isRecipeImportPageUrl
// --------------------------------------------------------------------------

describe('isRecipeImportPageUrl', () => {
  test('returns true for a valid recipeImportPage URL with token', () => {
    expect(isRecipeImportPageUrl('https://example.com/recipeImportPage?token=abc123')).toBe(true);
  });

  test('returns true regardless of extra query parameters', () => {
    expect(isRecipeImportPageUrl('https://example.com/recipeImportPage?token=xyz&foo=bar')).toBe(true);
  });

  test('returns false when token parameter is missing', () => {
    expect(isRecipeImportPageUrl('https://example.com/recipeImportPage')).toBe(false);
  });

  test('returns false for a different pathname', () => {
    expect(isRecipeImportPageUrl('https://example.com/recipes?token=abc123')).toBe(false);
  });

  test('returns false for a completely unrelated URL', () => {
    expect(isRecipeImportPageUrl('https://www.chefkoch.de/rezepte/123456')).toBe(false);
  });

  test('returns false for an invalid URL string', () => {
    expect(isRecipeImportPageUrl('not-a-url')).toBe(false);
  });

  test('returns false for an empty string', () => {
    expect(isRecipeImportPageUrl('')).toBe(false);
  });
});

// --------------------------------------------------------------------------
// parseRecipeImportPage
// --------------------------------------------------------------------------

describe('parseRecipeImportPage', () => {
  const mockRecipe = {
    title: 'Spaghetti Carbonara',
    ingredients: ['400g Spaghetti', '200g Pancetta'],
    steps: ['Nudeln kochen', 'Sauce zubereiten'],
    portionen: 4,
    kochdauer: 30,
    kulinarik: ['Italienisch'],
    schwierigkeit: 3,
    speisekategorie: 'Hauptgericht',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    parseOcrTextSmart.mockReturnValue({ recipe: mockRecipe, validation: {} });
  });

  function buildHtml({ title = 'Spaghetti Carbonara', rawText = 'Spaghetti Carbonara\nZutaten\n400g Spaghetti', withJsonLd = true } = {}) {
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: title,
      description: rawText,
    });
    return `<!DOCTYPE html>
<html lang="de">
<head>
<title>${title}</title>
${withJsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ''}
</head>
<body>
<h1>${title}</h1>
<pre>${rawText}</pre>
</body>
</html>`;
  }

  test('parses recipe data from JSON-LD and returns aiResult-compatible object', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(buildHtml()),
    });

    const result = await parseRecipeImportPage('https://example.com/recipeImportPage?token=abc');

    expect(result.title).toBe('Spaghetti Carbonara');
    expect(result.ingredients).toEqual(['400g Spaghetti', '200g Pancetta']);
    expect(result.steps).toEqual(['Nudeln kochen', 'Sauce zubereiten']);
    expect(result.servings).toBe(4);
    expect(result.cookTime).toBe('30 min');
    expect(result.difficulty).toBe(3);
    expect(result.cuisine).toBe('Italienisch');
    expect(result.category).toBe('Hauptgericht');
  });

  test('falls back to h1/pre when JSON-LD is absent', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(buildHtml({ withJsonLd: false })),
    });

    await parseRecipeImportPage('https://example.com/recipeImportPage?token=abc');

    // The OCR parser should be called with the text from <pre>
    expect(parseOcrTextSmart).toHaveBeenCalledWith(
      expect.stringContaining('Spaghetti Carbonara'),
      'de',
    );
  });

  test('reports progress across the 10–100 range', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(buildHtml()),
    });

    const progressValues = [];
    await parseRecipeImportPage(
      'https://example.com/recipeImportPage?token=abc',
      (p) => progressValues.push(p),
    );

    // At least an initial and a final progress call must have been made
    expect(progressValues.length).toBeGreaterThanOrEqual(2);
    expect(progressValues[0]).toBe(10);
    expect(progressValues[progressValues.length - 1]).toBe(100);
  });

  test('throws a user-friendly error on HTTP 404', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });

    await expect(
      parseRecipeImportPage('https://example.com/recipeImportPage?token=missing'),
    ).rejects.toThrow(/nicht gefunden/i);
  });

  test('throws a user-friendly error on HTTP 410', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 410 });

    await expect(
      parseRecipeImportPage('https://example.com/recipeImportPage?token=expired'),
    ).rejects.toThrow(/abgelaufen/i);
  });

  test('throws a user-friendly error on network failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      parseRecipeImportPage('https://example.com/recipeImportPage?token=abc'),
    ).rejects.toThrow(/geladen werden/i);
  });

  test('uses JSON-LD title when OCR parser returns generic fallback title', async () => {
    parseOcrTextSmart.mockReturnValue({
      recipe: { ...mockRecipe, title: 'OCR-Rezept' },
      validation: {},
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(buildHtml({ title: 'Echter Titel' })),
    });

    const result = await parseRecipeImportPage('https://example.com/recipeImportPage?token=abc');

    expect(result.title).toBe('Echter Titel');
  });

  test('handles kulinarik as an empty array gracefully', async () => {
    parseOcrTextSmart.mockReturnValue({
      recipe: { ...mockRecipe, kulinarik: [], speisekategorie: '' },
      validation: {},
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(buildHtml()),
    });

    const result = await parseRecipeImportPage('https://example.com/recipeImportPage?token=abc');

    expect(result.cuisine).toBeNull();
    expect(result.category).toBeNull();
  });
});
