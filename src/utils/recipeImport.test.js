import {
  parseRecipeData,
  importFromJSON,
  importFromNotionMarkdown,
  importFromNotionCSV,
  importRecipe,
  importFromURL,
  EXAMPLE_NOTION_RECIPE
} from './recipeImport';

describe('recipeImport', () => {
  describe('parseRecipeData', () => {
    test('parses valid recipe data with all fields', () => {
      const input = {
        title: 'Test Recipe',
        image: 'https://example.com/image.jpg',
        portionen: 4,
        kulinarik: ['Italian', 'Mediterranean'],
        schwierigkeit: 3,
        kochdauer: 30,
        speisekategorie: 'Main Course',
        ingredients: ['Ingredient 1', 'Ingredient 2'],
        steps: ['Step 1', 'Step 2']
      };

      const result = parseRecipeData(input);

      expect(result.title).toBe('Test Recipe');
      expect(result.image).toBe('https://example.com/image.jpg');
      expect(result.portionen).toBe(4);
      expect(result.kulinarik).toEqual(['Italian', 'Mediterranean']);
      expect(result.schwierigkeit).toBe(3);
      expect(result.kochdauer).toBe(30);
      expect(result.speisekategorie).toBe('Main Course');
      expect(result.ingredients).toEqual(['Ingredient 1', 'Ingredient 2']);
      expect(result.steps).toEqual(['Step 1', 'Step 2']);
    });

    test('maps alternative field names', () => {
      const input = {
        name: 'Alternative Name',
        servings: 6,
        cuisine: 'Thai',
        difficulty: 4,
        cookingTime: 45,
        category: 'Dessert',
        zutaten: ['Zutat 1', 'Zutat 2'],
        schritte: ['Schritt 1', 'Schritt 2']
      };

      const result = parseRecipeData(input);

      expect(result.title).toBe('Alternative Name');
      expect(result.portionen).toBe(6);
      expect(result.kulinarik).toEqual(['Thai']);
      expect(result.schwierigkeit).toBe(4);
      expect(result.kochdauer).toBe(45);
      expect(result.speisekategorie).toBe('Dessert');
      expect(result.ingredients).toEqual(['Zutat 1', 'Zutat 2']);
      expect(result.steps).toEqual(['Schritt 1', 'Schritt 2']);
    });

    test('applies default values for optional fields', () => {
      const input = {
        title: 'Minimal Recipe',
        ingredients: ['Ingredient 1'],
        steps: ['Step 1']
      };

      const result = parseRecipeData(input);

      expect(result.title).toBe('Minimal Recipe');
      expect(result.portionen).toBe(4);
      expect(result.schwierigkeit).toBe(3);
      expect(result.kochdauer).toBe(30);
      expect(result.image).toBe('');
      expect(result.speisekategorie).toBe('');
    });

    test('throws error when title is missing', () => {
      const input = {
        ingredients: ['Ingredient 1'],
        steps: ['Step 1']
      };

      expect(() => parseRecipeData(input)).toThrow('Rezepttitel fehlt');
    });

    test('throws error when ingredients are missing', () => {
      const input = {
        title: 'No Ingredients',
        steps: ['Step 1']
      };

      expect(() => parseRecipeData(input)).toThrow('mindestens eine Zutat');
    });

    test('throws error when steps are missing', () => {
      const input = {
        title: 'No Steps',
        ingredients: ['Ingredient 1']
      };

      expect(() => parseRecipeData(input)).toThrow('mindestens einen Zubereitungsschritt');
    });

    test('filters out empty ingredients and steps', () => {
      const input = {
        title: 'Recipe with empty items',
        ingredients: ['Ingredient 1', '', '  ', 'Ingredient 2'],
        steps: ['Step 1', '', 'Step 2']
      };

      const result = parseRecipeData(input);

      expect(result.ingredients).toEqual(['Ingredient 1', 'Ingredient 2']);
      expect(result.steps).toEqual(['Step 1', 'Step 2']);
    });

    test('converts string kulinarik to array', () => {
      const input = {
        title: 'Recipe',
        kulinarik: 'Italian',
        ingredients: ['Ingredient 1'],
        steps: ['Step 1']
      };

      const result = parseRecipeData(input);

      expect(result.kulinarik).toEqual(['Italian']);
    });

    test('clamps schwierigkeit to valid range', () => {
      const input1 = {
        title: 'Too Low',
        schwierigkeit: -1,
        ingredients: ['Ingredient 1'],
        steps: ['Step 1']
      };

      const input2 = {
        title: 'Too High',
        schwierigkeit: 10,
        ingredients: ['Ingredient 1'],
        steps: ['Step 1']
      };

      expect(parseRecipeData(input1).schwierigkeit).toBe(1);
      expect(parseRecipeData(input2).schwierigkeit).toBe(5);
    });
  });

  describe('importFromJSON', () => {
    test('imports valid JSON string', () => {
      const jsonString = JSON.stringify({
        title: 'JSON Recipe',
        ingredients: ['Ingredient 1'],
        steps: ['Step 1']
      });

      const result = importFromJSON(jsonString);

      expect(result.title).toBe('JSON Recipe');
      expect(result.ingredients).toEqual(['Ingredient 1']);
      expect(result.steps).toEqual(['Step 1']);
    });

    test('throws error for invalid JSON', () => {
      const invalidJSON = '{title: "Invalid"}';

      expect(() => importFromJSON(invalidJSON)).toThrow('Ungültiges JSON-Format');
    });

    test('throws error for JSON without title', () => {
      const jsonString = JSON.stringify({
        ingredients: ['Ingredient 1'],
        steps: ['Step 1']
      });

      expect(() => importFromJSON(jsonString)).toThrow('Rezepttitel fehlt');
    });
  });

  describe('importFromURL', () => {
    test('rejects invalid URL', async () => {
      await expect(importFromURL('not a url')).rejects.toThrow('Ungültige URL-Format');
    });

    test('provides guidance for Notion URLs', async () => {
      const notionUrl = 'https://www.notion.so/Pizza-Recipe-123';

      await expect(importFromURL(notionUrl)).rejects.toThrow('Notion-Import');
    });

    test('rejects empty URL', async () => {
      await expect(importFromURL('')).rejects.toThrow('Ungültige URL');
    });

    test('rejects null URL', async () => {
      await expect(importFromURL(null)).rejects.toThrow('Ungültige URL');
    });

    test('provides guidance for non-Notion URLs', async () => {
      const genericUrl = 'https://example.com/recipe';

      await expect(importFromURL(genericUrl)).rejects.toThrow('URL-Import ist noch nicht implementiert');
    });
  });

  describe('EXAMPLE_NOTION_RECIPE', () => {
    test('example recipe is valid', () => {
      const result = parseRecipeData(EXAMPLE_NOTION_RECIPE);

      expect(result.title).toBe('Pizza Bianco al Tartufo');
      expect(result.ingredients.length).toBeGreaterThan(0);
      expect(result.steps.length).toBeGreaterThan(0);
    });
  });

  describe('importFromNotionMarkdown', () => {
    test('imports valid Notion markdown', () => {
      const markdown = `# Test Recipe

Portionen: 4

## Zutaten

- Ingredient 1
- Ingredient 2

## Zubereitung

1. Step 1
2. Step 2
`;

      const result = importFromNotionMarkdown(markdown);
      expect(result.title).toBe('Test Recipe');
      expect(result.portionen).toBe(4);
      expect(result.ingredients).toEqual(['Ingredient 1', 'Ingredient 2']);
      expect(result.steps).toEqual(['Step 1', 'Step 2']);
    });
  });

  describe('importFromNotionCSV', () => {
    test('throws error when CSV lacks ingredients and steps', () => {
      // CSV format cannot contain ingredients/steps lists
      // This limitation is by design - CSV is only for metadata
      const csv = `Name,Portionen,Schwierigkeit
Test Recipe,4,3`;

      expect(() => importFromNotionCSV(csv)).toThrow('mindestens eine Zutat');
    });
  });

  describe('importRecipe', () => {
    test('auto-detects JSON format', () => {
      const json = JSON.stringify({
        title: 'JSON Recipe',
        ingredients: ['Ingredient 1'],
        steps: ['Step 1']
      });

      const result = importRecipe(json);
      expect(result.title).toBe('JSON Recipe');
    });

    test('auto-detects Markdown format', () => {
      const markdown = `# Markdown Recipe

## Ingredients
- Ingredient 1
## Steps
- Step 1
`;

      const result = importRecipe(markdown);
      expect(result.title).toBe('Markdown Recipe');
    });

    test('throws error for unrecognized format', () => {
      const invalidContent = 'Just some random text';
      expect(() => importRecipe(invalidContent)).toThrow('Format konnte nicht erkannt werden');
    });

    test('throws error for empty content', () => {
      expect(() => importRecipe('')).toThrow('Kein Inhalt zum Importieren');
    });
  });
});
