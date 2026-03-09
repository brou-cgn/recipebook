/**
 * Tests for the webImportService helper utilities,
 * focusing on the recipeImportPage direct-parse path.
 */

// Mock firebase and firebase/functions so the module can be imported in Jest
jest.mock('../firebase', () => ({ functions: {} }));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn() }));

// Mock the AI OCR service so we can control its output in unit tests
jest.mock('./aiOcrService', () => ({
  recognizeRecipeWithAI: jest.fn(),
  processHtmlWithGemini: jest.fn(),
}));

// Mock ocrParser to allow testing the fallback path
jest.mock('./ocrParser', () => ({
  parseOcrText: jest.fn(),
  extractKulinarikFromTags: jest.fn().mockReturnValue([]),
}));

// Mock canvas API since jsdom does not implement it
HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue({
  fillStyle: '',
  fillRect: jest.fn(),
  fillText: jest.fn(),
  measureText: jest.fn().mockReturnValue({ width: 0 }),
  font: '',
});
HTMLCanvasElement.prototype.toDataURL = jest.fn().mockReturnValue('data:image/png;base64,mockcanvas');

import { isRecipeImportPageUrl, parseRecipeImportPage, extractTextFromHtml, isInstagramReelUrl, importInstagramReel, parseJsonLdRecipe, importRecipeFromUrl } from './webImportService';
import { recognizeRecipeWithAI, processHtmlWithGemini } from './aiOcrService';
import { parseOcrText } from './ocrParser';
import { httpsCallable } from 'firebase/functions';

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
// extractTextFromHtml
// --------------------------------------------------------------------------

describe('extractTextFromHtml', () => {
  test('extracts plain text from a simple HTML document', () => {
    const html = '<!DOCTYPE html><html><body><p>Hello World</p></body></html>';
    const result = extractTextFromHtml(html);
    expect(result).toContain('Hello World');
    expect(result).not.toMatch(/<[^>]+>/);
  });

  test('removes script and style tags', () => {
    const html = '<html><head><script>alert("x")</script><style>body{color:red}</style></head><body>Visible content</body></html>';
    const result = extractTextFromHtml(html);
    expect(result).toContain('Visible content');
    expect(result).not.toContain('alert');
    expect(result).not.toContain('color:red');
  });

  test('removes nav, header, footer and aside tags', () => {
    const html = '<html><body><header>Site header</header><nav>Menu</nav><main>Recipe text</main><aside>Sidebar</aside><footer>Footer</footer></body></html>';
    const result = extractTextFromHtml(html);
    expect(result).toContain('Recipe text');
    expect(result).not.toContain('Site header');
    expect(result).not.toContain('Menu');
    expect(result).not.toContain('Sidebar');
    expect(result).not.toContain('Footer');
  });

  test('truncates output to 80,000 characters', () => {
    const longContent = 'A'.repeat(100000);
    const html = `<html><body><p>${longContent}</p></body></html>`;
    const result = extractTextFromHtml(html);
    expect(result.length).toBeLessThanOrEqual(80000);
  });

  test('collapses excessive blank lines', () => {
    const html = '<html><body><p>Line 1</p>\n\n\n\n<p>Line 2</p></body></html>';
    const result = extractTextFromHtml(html);
    expect(result).not.toMatch(/\n{3,}/);
  });

  test('falls back to regex stripping when DOMParser is unavailable', () => {
    const origDOMParser = global.DOMParser;
    try {
      global.DOMParser = function () { throw new Error('No DOMParser'); };
      const html = '<p>Fallback content</p>';
      const result = extractTextFromHtml(html);
      expect(result).toContain('Fallback content');
      expect(result).not.toMatch(/<[^>]+>/);
    } finally {
      global.DOMParser = origDOMParser;
    }
  });
});

// --------------------------------------------------------------------------
// parseRecipeImportPage
// --------------------------------------------------------------------------

describe('parseRecipeImportPage', () => {
  const mockAiResult = {
    title: 'Spaghetti Carbonara',
    ingredients: ['400g Spaghetti', '200g Pancetta'],
    steps: ['Nudeln kochen', 'Sauce zubereiten'],
    servings: 4,
    prepTime: null,
    cookTime: '30 min',
    difficulty: 3,
    cuisine: 'Italienisch',
    category: 'Hauptgericht',
    tags: [],
  };

  beforeEach(() => {
    jest.resetAllMocks();
    // Reset canvas mocks
    HTMLCanvasElement.prototype.getContext.mockReturnValue({
      fillStyle: '',
      fillRect: jest.fn(),
      fillText: jest.fn(),
      measureText: jest.fn().mockReturnValue({ width: 0 }),
      font: '',
    });
    HTMLCanvasElement.prototype.toDataURL.mockReturnValue('data:image/png;base64,mockcanvas');
    recognizeRecipeWithAI.mockResolvedValue(mockAiResult);
    // Also mock processHtmlWithGemini so HTML-content tests succeed by default
    processHtmlWithGemini.mockResolvedValue(mockAiResult);
    parseOcrText.mockReturnValue({
      title: 'Fallback Rezept',
      ingredients: ['500g Mehl', '2 Eier'],
      steps: ['Mehl sieben', 'Eier hinzufügen'],
      portionen: 4,
      kochdauer: 30,
      schwierigkeit: 2,
      kulinarik: ['Deutsch'],
      speisekategorie: 'Hauptgericht',
    });
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

  test('calls AI with text from JSON-LD description', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(buildHtml()),
    });

    await parseRecipeImportPage('https://example.com/recipeImportPage?token=abc');

    // AI should have been called with a canvas image and German language
    expect(recognizeRecipeWithAI).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ language: 'de', provider: 'gemini' }),
    );
  });

  test('falls back to h1/pre text when JSON-LD is absent', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(buildHtml({ withJsonLd: false })),
    });

    await parseRecipeImportPage('https://example.com/recipeImportPage?token=abc');

    // AI should still be called (with text from <pre> rendered to canvas)
    expect(recognizeRecipeWithAI).toHaveBeenCalled();
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

  test('uses JSON-LD title when AI returns no title', async () => {
    recognizeRecipeWithAI.mockResolvedValue({
      ...mockAiResult,
      title: '',
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(buildHtml({ title: 'Echter Titel' })),
    });

    const result = await parseRecipeImportPage('https://example.com/recipeImportPage?token=abc');

    expect(result.title).toBe('Echter Titel');
  });

  test('handles null cuisine and category gracefully', async () => {
    recognizeRecipeWithAI.mockResolvedValue({
      ...mockAiResult,
      cuisine: null,
      category: null,
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(buildHtml()),
    });

    const result = await parseRecipeImportPage('https://example.com/recipeImportPage?token=abc');

    expect(result.cuisine).toBeNull();
    expect(result.category).toBeNull();
  });

  test('includes tags from AI result', async () => {
    recognizeRecipeWithAI.mockResolvedValue({
      ...mockAiResult,
      tags: ['vegetarisch', 'glutenfrei'],
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(buildHtml()),
    });

    const result = await parseRecipeImportPage('https://example.com/recipeImportPage?token=abc');

    expect(result.tags).toEqual(['vegetarisch', 'glutenfrei']);
  });

  test('falls back to text parsing when AI throws an error', async () => {
    recognizeRecipeWithAI.mockRejectedValue(new Error('AI parsing failed'));

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(buildHtml({ rawText: 'Fallback Rezept\nZutaten\n500g Mehl' })),
    });

    const result = await parseRecipeImportPage('https://example.com/recipeImportPage?token=abc');

    expect(parseOcrText).toHaveBeenCalled();
    expect(result.ingredients).toEqual(['500g Mehl', '2 Eier']);
    expect(result.steps).toEqual(['Mehl sieben', 'Eier hinzufügen']);
    expect(result.servings).toBe(4);
    expect(result.cookTime).toBe('30 min');
    expect(result.cuisine).toBe('Deutsch');
    expect(result.category).toBe('Hauptgericht');
  });

  test('fallback uses JSON-LD title when parsed title is absent', async () => {
    recognizeRecipeWithAI.mockRejectedValue(new Error('AI error'));
    parseOcrText.mockReturnValue({
      title: '',
      ingredients: ['Zutat 1'],
      steps: ['Schritt 1'],
      portionen: null,
      kochdauer: null,
      schwierigkeit: null,
      kulinarik: [],
      speisekategorie: '',
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(buildHtml({ title: 'Toller Titel' })),
    });

    const result = await parseRecipeImportPage('https://example.com/recipeImportPage?token=abc');

    expect(result.title).toBe('Toller Titel');
  });

  test('re-throws AI error when rawText is empty and AI fails', async () => {
    const aiError = new Error('AI error');
    recognizeRecipeWithAI.mockRejectedValue(aiError);

    // Build HTML without any rawText (empty description and pre)
    const emptyHtml = `<!DOCTYPE html><html><head></head><body><h1>Test</h1><pre></pre></body></html>`;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(emptyHtml),
    });

    await expect(
      parseRecipeImportPage('https://example.com/recipeImportPage?token=abc'),
    ).rejects.toThrow('AI error');
  });

  test('processes raw HTML from Instagram via processHtmlWithGemini', async () => {
    const rawHtmlContent = `<!DOCTYPE html><html class="_9dls" lang="de"><head></head><body>Instagram content</body></html>`;
    // HTML-escape the raw HTML so DOMParser stores it as text inside <pre>
    const escapedRawHtml = rawHtmlContent
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    // The import page wraps the captured content inside a <pre> tag
    const importPageHtml = `<!DOCTYPE html>
<html lang="de">
<head><title>Import</title></head>
<body>
<h1>Import</h1>
<pre>${escapedRawHtml}</pre>
</body>
</html>`;

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(importPageHtml),
    });

    const result = await parseRecipeImportPage('https://example.com/recipeImportPage?token=abc');

    // processHtmlWithGemini should have been called with cleaned plain text (not raw HTML)
    expect(processHtmlWithGemini).toHaveBeenCalledWith(
      expect.not.stringMatching(/<[^>]+>/),
      'de',
      null,
    );

    // recognizeRecipeWithAI (canvas-based) should NOT have been called
    expect(recognizeRecipeWithAI).not.toHaveBeenCalled();

    // Result should match the mocked AI output
    expect(result.title).toBe('Spaghetti Carbonara');
    expect(result.ingredients).toEqual(['400g Spaghetti', '200g Pancetta']);
  });

  test('processes raw HTML from JSON-LD description via processHtmlWithGemini', async () => {
    const rawHtmlContent = '<html lang="de"><body>Non-recipe page</body></html>';
    const jsonLd = JSON.stringify({ name: 'Test', description: rawHtmlContent });
    const importPageHtml = `<!DOCTYPE html>
<html lang="de">
<head>
<script type="application/ld+json">${jsonLd}</script>
</head>
<body></body>
</html>`;

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(importPageHtml),
    });

    const result = await parseRecipeImportPage('https://example.com/recipeImportPage?token=abc');

    expect(processHtmlWithGemini).toHaveBeenCalledWith(
      expect.not.stringMatching(/<[^>]+>/),
      'de',
      null,
    );
    expect(recognizeRecipeWithAI).not.toHaveBeenCalled();
    expect(result.title).toBe('Spaghetti Carbonara');
  });

  test('wraps processHtmlWithGemini error with user-friendly message', async () => {
    processHtmlWithGemini.mockRejectedValue(new Error('AI unavailable'));

    const rawHtmlContent = `<!DOCTYPE html><html><body>Instagram</body></html>`;
    const escapedRawHtml = rawHtmlContent
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const importPageHtml = `<!DOCTYPE html>
<html lang="de">
<head><title>Import</title></head>
<body><pre>${escapedRawHtml}</pre>
</body>
</html>`;

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(importPageHtml),
    });

    await expect(
      parseRecipeImportPage('https://example.com/recipeImportPage?token=abc'),
    ).rejects.toThrow(/nicht als Rezept verarbeitet werden/i);
  });

  test('re-throws AI error when text parsing also fails', async () => {
    const aiError = new Error('AI error');
    recognizeRecipeWithAI.mockRejectedValue(aiError);
    parseOcrText.mockImplementation(() => { throw new Error('parse error'); });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(buildHtml({ rawText: 'Spaghetti\nZutaten\n400g Spaghetti' })),
    });

    await expect(
      parseRecipeImportPage('https://example.com/recipeImportPage?token=abc'),
    ).rejects.toThrow('AI error');
  });
});

// --------------------------------------------------------------------------
// isInstagramReelUrl
// --------------------------------------------------------------------------

describe('isInstagramReelUrl', () => {
  test('returns true for a standard www.instagram.com reel URL', () => {
    expect(isInstagramReelUrl('https://www.instagram.com/reel/DTXPDu9DHHb/')).toBe(true);
  });

  test('returns true for instagram.com (without www) reel URL', () => {
    expect(isInstagramReelUrl('https://instagram.com/reel/ABC123/')).toBe(true);
  });

  test('returns true for a reel URL without trailing slash', () => {
    expect(isInstagramReelUrl('https://www.instagram.com/reel/DTXPDu9DHHb')).toBe(true);
  });

  test('returns true for reel IDs containing underscores and hyphens', () => {
    expect(isInstagramReelUrl('https://www.instagram.com/reel/abc-def_123/')).toBe(true);
  });

  test('returns false for an Instagram post (non-reel) URL', () => {
    expect(isInstagramReelUrl('https://www.instagram.com/p/DTXPDu9DHHb/')).toBe(false);
  });

  test('returns false for an Instagram profile URL', () => {
    expect(isInstagramReelUrl('https://www.instagram.com/username/')).toBe(false);
  });

  test('returns false for an unrelated URL', () => {
    expect(isInstagramReelUrl('https://www.chefkoch.de/rezepte/123456')).toBe(false);
  });

  test('returns false for an empty string', () => {
    expect(isInstagramReelUrl('')).toBe(false);
  });

  test('returns false for an invalid URL string', () => {
    expect(isInstagramReelUrl('not-a-url')).toBe(false);
  });

  test('returns false for a URL with no reel ID', () => {
    expect(isInstagramReelUrl('https://www.instagram.com/reel/')).toBe(false);
  });
});

// --------------------------------------------------------------------------
// importInstagramReel
// --------------------------------------------------------------------------

describe('importInstagramReel', () => {
  const mockReelResult = {
    title: 'Pasta Rezept',
    ingredients: ['400g Spaghetti', '200g Speck'],
    steps: ['Nudeln kochen', 'Speck braten'],
    servings: 2,
    prepTime: '10 min',
    cookTime: '20 min',
    difficulty: 2,
    cuisine: 'Italienisch',
    category: 'Hauptgericht',
    tags: [],
    sourceUrl: 'https://www.instagram.com/reel/DTXPDu9DHHb/',
  };

  const validReelUrl = 'https://www.instagram.com/reel/DTXPDu9DHHb/';

  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('throws immediately for an invalid Instagram Reel URL', async () => {
    await expect(
      importInstagramReel('https://www.chefkoch.de/rezepte/123'),
    ).rejects.toThrow(/ungültige/i);
  });

  test('calls the scrapeInstagramReel Cloud Function with the correct arguments', async () => {
    const mockCallable = jest.fn().mockResolvedValue({ data: mockReelResult });
    httpsCallable.mockReturnValue(mockCallable);

    await importInstagramReel(validReelUrl);

    expect(httpsCallable).toHaveBeenCalledWith({}, 'scrapeInstagramReel');
    expect(mockCallable).toHaveBeenCalledWith(
      expect.objectContaining({ url: validReelUrl, language: 'de' }),
    );
  });

  test('returns structured recipe data from a successful Cloud Function call', async () => {
    const mockCallable = jest.fn().mockResolvedValue({ data: mockReelResult });
    httpsCallable.mockReturnValue(mockCallable);

    const result = await importInstagramReel(validReelUrl);

    expect(result.title).toBe('Pasta Rezept');
    expect(result.ingredients).toEqual(['400g Spaghetti', '200g Speck']);
    expect(result.steps).toEqual(['Nudeln kochen', 'Speck braten']);
    expect(result.servings).toBe(2);
    expect(result.cuisine).toBe('Italienisch');
    expect(result.category).toBe('Hauptgericht');
  });

  test('maps prepTime to cookTime in the result', async () => {
    const mockCallable = jest.fn().mockResolvedValue({ data: { ...mockReelResult, cookTime: null } });
    httpsCallable.mockReturnValue(mockCallable);

    const result = await importInstagramReel(validReelUrl);

    expect(result.cookTime).toBe('10 min');
  });

  test('reports progress during the Cloud Function call', async () => {
    const mockCallable = jest.fn().mockResolvedValue({ data: mockReelResult });
    httpsCallable.mockReturnValue(mockCallable);

    const progressValues = [];
    await importInstagramReel(validReelUrl, (p) => progressValues.push(p));

    expect(progressValues.length).toBeGreaterThanOrEqual(2);
    expect(progressValues[0]).toBeGreaterThan(0);
    expect(progressValues[progressValues.length - 1]).toBe(100);
  });

  test('throws a user-friendly error when the Cloud Function returns unauthenticated', async () => {
    const error = Object.assign(new Error('not logged in'), { code: 'unauthenticated' });
    const mockCallable = jest.fn().mockRejectedValue(error);
    httpsCallable.mockReturnValue(mockCallable);

    await expect(importInstagramReel(validReelUrl)).rejects.toThrow(/melde dich an/i);
  });

  test('throws a user-friendly error when rate limit is exceeded', async () => {
    const error = Object.assign(new Error('limit reached'), { code: 'resource-exhausted' });
    const mockCallable = jest.fn().mockRejectedValue(error);
    httpsCallable.mockReturnValue(mockCallable);

    await expect(importInstagramReel(validReelUrl)).rejects.toThrow(/limit reached/i);
  });

  test('throws a user-friendly error when the page has no recipe content', async () => {
    const error = Object.assign(new Error('Kein Rezeptinhalt'), { code: 'not-found' });
    const mockCallable = jest.fn().mockRejectedValue(error);
    httpsCallable.mockReturnValue(mockCallable);

    await expect(importInstagramReel(validReelUrl)).rejects.toThrow(/Kein Rezeptinhalt/i);
  });

  test('throws a user-friendly error on deadline exceeded', async () => {
    const error = Object.assign(new Error('timeout'), { code: 'deadline-exceeded' });
    const mockCallable = jest.fn().mockRejectedValue(error);
    httpsCallable.mockReturnValue(mockCallable);

    await expect(importInstagramReel(validReelUrl)).rejects.toThrow(/zu lange gebraucht/i);
  });

  test('throws a fallback error when Cloud Function returns null data', async () => {
    const mockCallable = jest.fn().mockResolvedValue({ data: null });
    httpsCallable.mockReturnValue(mockCallable);

    await expect(importInstagramReel(validReelUrl)).rejects.toThrow(/kein ergebnis/i);
  });
});

// --------------------------------------------------------------------------
// parseJsonLdRecipe
// --------------------------------------------------------------------------

describe('parseJsonLdRecipe', () => {
  function buildRecipePage(jsonLd) {
    return `<!DOCTYPE html>
<html lang="de">
<head>
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body><h1>Test</h1></body>
</html>`;
  }

  test('extracts a basic Schema.org Recipe with string instructions', () => {
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Veganes Naan',
      recipeIngredient: ['300 g Mehl', '200 ml Kokosjoghurt'],
      recipeInstructions: ['Mehl sieben.', 'Joghurt unterrühren.'],
      recipeYield: '4',
      prepTime: 'PT15M',
      cookTime: 'PT20M',
      recipeCuisine: 'Indisch',
      recipeCategory: 'Beilage',
    };

    const result = parseJsonLdRecipe(buildRecipePage(jsonLd));

    expect(result).not.toBeNull();
    expect(result.title).toBe('Veganes Naan');
    expect(result.ingredients).toEqual(['300 g Mehl', '200 ml Kokosjoghurt']);
    expect(result.steps).toEqual(['Mehl sieben.', 'Joghurt unterrühren.']);
    expect(result.servings).toBe(4);
    expect(result.prepTime).toBe('15 min');
    expect(result.cookTime).toBe('20 min');
    expect(result.cuisine).toBe('Indisch');
    expect(result.category).toBe('Beilage');
  });

  test('extracts instructions from HowToStep objects', () => {
    const jsonLd = {
      '@type': 'Recipe',
      name: 'Pasta',
      recipeIngredient: ['400 g Nudeln'],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Wasser kochen.' },
        { '@type': 'HowToStep', text: 'Nudeln hinzufügen.' },
      ],
    };

    const result = parseJsonLdRecipe(buildRecipePage(jsonLd));

    expect(result).not.toBeNull();
    expect(result.steps).toEqual(['Wasser kochen.', 'Nudeln hinzufügen.']);
  });

  test('extracts instructions from HowToSection with nested HowToStep objects', () => {
    const jsonLd = {
      '@type': 'Recipe',
      name: 'Kuchen',
      recipeIngredient: ['200 g Mehl'],
      recipeInstructions: [
        {
          '@type': 'HowToSection',
          name: 'Teig',
          itemListElement: [
            { '@type': 'HowToStep', text: 'Mehl sieben.' },
            { '@type': 'HowToStep', text: 'Butter hinzufügen.' },
          ],
        },
      ],
    };

    const result = parseJsonLdRecipe(buildRecipePage(jsonLd));

    expect(result).not.toBeNull();
    expect(result.steps).toEqual(['Mehl sieben.', 'Butter hinzufügen.']);
  });

  test('handles @graph arrays', () => {
    const jsonLd = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', name: 'Page' },
        {
          '@type': 'Recipe',
          name: 'Rezept aus Graph',
          recipeIngredient: ['1 Ei'],
          recipeInstructions: ['Ei kochen.'],
        },
      ],
    };

    const result = parseJsonLdRecipe(buildRecipePage(jsonLd));

    expect(result).not.toBeNull();
    expect(result.title).toBe('Rezept aus Graph');
    expect(result.ingredients).toEqual(['1 Ei']);
  });

  test('handles @type as an array', () => {
    const jsonLd = {
      '@type': ['Recipe', 'CreativeWork'],
      name: 'Multi-type Rezept',
      recipeIngredient: ['2 Tomaten'],
      recipeInstructions: ['Tomaten schneiden.'],
    };

    const result = parseJsonLdRecipe(buildRecipePage(jsonLd));

    expect(result).not.toBeNull();
    expect(result.title).toBe('Multi-type Rezept');
  });

  test('parses ISO 8601 durations including hours', () => {
    const jsonLd = {
      '@type': 'Recipe',
      name: 'Langsames Schmorgericht',
      recipeIngredient: ['500 g Rindfleisch'],
      recipeInstructions: ['Schmoren.'],
      prepTime: 'PT1H30M',
      cookTime: 'PT2H',
    };

    const result = parseJsonLdRecipe(buildRecipePage(jsonLd));

    expect(result.prepTime).toBe('90 min');
    expect(result.cookTime).toBe('120 min');
  });

  test('returns null when no Recipe JSON-LD is found', () => {
    const html = '<!DOCTYPE html><html><head></head><body>Kein Rezept</body></html>';
    expect(parseJsonLdRecipe(html)).toBeNull();
  });

  test('returns null when JSON-LD has no ingredients or steps', () => {
    const jsonLd = {
      '@type': 'Recipe',
      name: 'Leeres Rezept',
      recipeIngredient: [],
      recipeInstructions: [],
    };
    expect(parseJsonLdRecipe(buildRecipePage(jsonLd))).toBeNull();
  });

  test('returns null for invalid HTML', () => {
    expect(parseJsonLdRecipe('')).toBeNull();
  });

  test('returns null when JSON-LD contains invalid JSON', () => {
    const html = `<html><head><script type="application/ld+json">{invalid json}</script></head></html>`;
    expect(parseJsonLdRecipe(html)).toBeNull();
  });

  test('extracts recipeYield with surrounding text', () => {
    const jsonLd = {
      '@type': 'Recipe',
      name: 'Brot',
      recipeIngredient: ['500 g Mehl'],
      recipeInstructions: ['Backen.'],
      recipeYield: '8 Scheiben',
    };

    const result = parseJsonLdRecipe(buildRecipePage(jsonLd));

    expect(result.servings).toBe(8);
  });

  test('handles recipeYield as an array', () => {
    const jsonLd = {
      '@type': 'Recipe',
      name: 'Kekse',
      recipeIngredient: ['200 g Zucker'],
      recipeInstructions: ['Backen.'],
      recipeYield: ['24 Kekse'],
    };

    const result = parseJsonLdRecipe(buildRecipePage(jsonLd));

    expect(result.servings).toBe(24);
  });

  test('handles recipeCuisine and recipeCategory as arrays', () => {
    const jsonLd = {
      '@type': 'Recipe',
      name: 'Fusion',
      recipeIngredient: ['1 Tomate'],
      recipeInstructions: ['Schneiden.'],
      recipeCuisine: ['Mediterran', 'Asiatisch'],
      recipeCategory: ['Hauptgericht', 'Salat'],
    };

    const result = parseJsonLdRecipe(buildRecipePage(jsonLd));

    expect(result.cuisine).toBe('Mediterran');
    expect(result.category).toBe('Hauptgericht');
  });
});

// --------------------------------------------------------------------------
// importRecipeFromUrl
// --------------------------------------------------------------------------

describe('importRecipeFromUrl', () => {
  const mockAiResult = {
    title: 'Spaghetti Carbonara',
    ingredients: ['400g Spaghetti', '200g Pancetta'],
    steps: ['Nudeln kochen', 'Sauce zubereiten'],
    servings: 4,
    prepTime: null,
    cookTime: '30 min',
    difficulty: 3,
    cuisine: 'Italienisch',
    category: 'Hauptgericht',
    tags: [],
  };

  const recipeJsonLd = {
    '@type': 'Recipe',
    name: 'Veganes Naan',
    recipeIngredient: ['300 g Mehl', '200 ml Kokosjoghurt'],
    recipeInstructions: ['Teig kneten.', 'In der Pfanne backen.'],
    recipeYield: '4',
    prepTime: 'PT15M',
  };

  const htmlWithJsonLd = `<!DOCTYPE html>
<html lang="de">
<head>
<title>Veganes Naan</title>
<script type="application/ld+json">${JSON.stringify(recipeJsonLd)}</script>
</head>
<body><h1>Veganes Naan</h1></body>
</html>`;

  const htmlWithoutJsonLd = `<!DOCTYPE html>
<html lang="de">
<head><title>Rezept</title></head>
<body><h1>Pasta</h1><p>Kochwasser salzen. Nudeln 8 Minuten kochen.</p></body>
</html>`;

  beforeEach(() => {
    jest.resetAllMocks();
    recognizeRecipeWithAI.mockResolvedValue(mockAiResult);
    processHtmlWithGemini.mockResolvedValue(mockAiResult);
    HTMLCanvasElement.prototype.getContext.mockReturnValue({
      fillStyle: '', fillRect: jest.fn(), fillText: jest.fn(),
      measureText: jest.fn().mockReturnValue({ width: 0 }), font: '',
    });
    HTMLCanvasElement.prototype.toDataURL.mockReturnValue('data:image/png;base64,mockcanvas');
  });

  test('returns JSON-LD data directly when a Schema.org Recipe is found', async () => {
    const mockFetchCallable = jest.fn().mockResolvedValue({ data: { html: htmlWithJsonLd } });
    httpsCallable.mockReturnValue(mockFetchCallable);

    const result = await importRecipeFromUrl('https://example.com/rezept');

    expect(httpsCallable).toHaveBeenCalledWith({}, 'fetchRecipeHtml');
    expect(result.title).toBe('Veganes Naan');
    expect(result.ingredients).toEqual(['300 g Mehl', '200 ml Kokosjoghurt']);
    expect(result.steps).toEqual(['Teig kneten.', 'In der Pfanne backen.']);
    expect(result.servings).toBe(4);
    expect(result.prepTime).toBe('15 min');
    // Should NOT call Gemini when JSON-LD is found
    expect(processHtmlWithGemini).not.toHaveBeenCalled();
    expect(recognizeRecipeWithAI).not.toHaveBeenCalled();
  });

  test('falls back to text+Gemini when no JSON-LD Recipe is present', async () => {
    const mockFetchCallable = jest.fn().mockResolvedValue({ data: { html: htmlWithoutJsonLd } });
    httpsCallable.mockReturnValue(mockFetchCallable);

    const result = await importRecipeFromUrl('https://example.com/rezept');

    expect(processHtmlWithGemini).toHaveBeenCalledWith(
      expect.any(String),
      'de',
      null,
    );
    expect(result.title).toBe('Spaghetti Carbonara');
    // Should NOT call screenshot
    expect(recognizeRecipeWithAI).not.toHaveBeenCalled();
  });

  test('falls back to screenshot+vision when both HTML steps fail', async () => {
    // fetchRecipeHtml fails
    const mockFetchCallable = jest.fn().mockRejectedValue(new Error('Network error'));
    httpsCallable.mockImplementation((_, name) => {
      if (name === 'fetchRecipeHtml') return mockFetchCallable;
      // captureWebsiteScreenshot CF
      return jest.fn().mockResolvedValue({ data: { screenshot: 'data:image/jpeg;base64,screen' } });
    });

    const result = await importRecipeFromUrl('https://example.com/rezept');

    expect(recognizeRecipeWithAI).toHaveBeenCalled();
    expect(result.title).toBe('Spaghetti Carbonara');
  });

  test('falls back to screenshot+vision when text+Gemini also fails', async () => {
    const mockFetchCallable = jest.fn().mockResolvedValue({ data: { html: htmlWithoutJsonLd } });
    processHtmlWithGemini.mockRejectedValue(new Error('AI error'));

    httpsCallable.mockImplementation((_, name) => {
      if (name === 'fetchRecipeHtml') return mockFetchCallable;
      return jest.fn().mockResolvedValue({ data: { screenshot: 'data:image/jpeg;base64,screen' } });
    });

    const result = await importRecipeFromUrl('https://example.com/rezept');

    expect(recognizeRecipeWithAI).toHaveBeenCalled();
    expect(result.title).toBe('Spaghetti Carbonara');
  });

  test('reports progress during JSON-LD import', async () => {
    const mockFetchCallable = jest.fn().mockResolvedValue({ data: { html: htmlWithJsonLd } });
    httpsCallable.mockReturnValue(mockFetchCallable);

    const progressValues = [];
    await importRecipeFromUrl('https://example.com/rezept', (p) => progressValues.push(p));

    expect(progressValues.length).toBeGreaterThanOrEqual(2);
    expect(progressValues[0]).toBeGreaterThan(0);
    expect(progressValues[progressValues.length - 1]).toBe(100);
  });

  test('maps aiResult fields correctly when using text+Gemini path', async () => {
    const mockFetchCallable = jest.fn().mockResolvedValue({ data: { html: htmlWithoutJsonLd } });
    httpsCallable.mockReturnValue(mockFetchCallable);
    processHtmlWithGemini.mockResolvedValue({
      ...mockAiResult,
      prepTime: '20 min',
      cookTime: null,
    });

    const result = await importRecipeFromUrl('https://example.com/rezept');

    expect(result.cookTime).toBe('20 min');
    expect(result.cuisine).toBe('Italienisch');
    expect(result.tags).toEqual([]);
  });
});
