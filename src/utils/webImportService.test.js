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

import { isRecipeImportPageUrl, parseRecipeImportPage, extractTextFromHtml } from './webImportService';
import { recognizeRecipeWithAI, processHtmlWithGemini } from './aiOcrService';
import { parseOcrText } from './ocrParser';

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
