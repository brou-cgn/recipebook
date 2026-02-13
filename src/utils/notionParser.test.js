import {
  parseNotionMarkdown,
  parseNotionCSV,
  EXAMPLE_NOTION_MARKDOWN
} from './notionParser';

describe('notionParser', () => {
  describe('parseNotionMarkdown', () => {
    test('parses example Notion markdown correctly', () => {
      const result = parseNotionMarkdown(EXAMPLE_NOTION_MARKDOWN);

      expect(result.title).toBe('Pizza Bianco al Tartufo');
      expect(result.portionen).toBe(4);
      expect(result.kulinarik).toEqual(['Italienisch']);
      expect(result.schwierigkeit).toBe(3);
      expect(result.kochdauer).toBe(45);
      expect(result.speisekategorie).toBe('Hauptgericht');
      expect(result.ingredients).toHaveLength(6);
      expect(result.steps).toHaveLength(6);
    });

    test('extracts title from first heading', () => {
      const markdown = `# Spaghetti Carbonara

## Ingredients

- Pasta
- Eggs
`;
      const result = parseNotionMarkdown(markdown);
      expect(result.title).toBe('Spaghetti Carbonara');
    });

    test('parses ingredients from bullet list', () => {
      const markdown = `# Test Recipe

## Zutaten

- 500g Mehl
- 2 Eier
- 100ml Milch
`;
      const result = parseNotionMarkdown(markdown);
      expect(result.ingredients).toEqual(['500g Mehl', '2 Eier', '100ml Milch']);
    });

    test('parses steps from numbered list', () => {
      const markdown = `# Test Recipe

## Ingredients
- Ingredient 1

## Zubereitung

1. Mehl in eine Schüssel geben
2. Eier hinzufügen
3. Alles vermengen
`;
      const result = parseNotionMarkdown(markdown);
      expect(result.steps).toEqual([
        'Mehl in eine Schüssel geben',
        'Eier hinzufügen',
        'Alles vermengen'
      ]);
    });

    test('parses properties from key-value format', () => {
      const markdown = `# Recipe

Portionen: 6
Kulinarik: Thai, Asiatisch
Schwierigkeit: 4
Kochdauer: 60
Speisekategorie: Hauptgericht

## Ingredients
- Ingredient 1
## Steps
- Step 1
`;
      const result = parseNotionMarkdown(markdown);
      expect(result.portionen).toBe(6);
      expect(result.kulinarik).toEqual(['Thai', 'Asiatisch']);
      expect(result.schwierigkeit).toBe(4);
      expect(result.kochdauer).toBe(60);
      expect(result.speisekategorie).toBe('Hauptgericht');
    });

    test('parses properties with bold markdown formatting', () => {
      const markdown = `# Recipe

**Portionen:** 4
**Kochdauer:** 30 Minuten
**Schwierigkeit:** 2

## Ingredients
- Ingredient 1
## Steps
- Step 1
`;
      const result = parseNotionMarkdown(markdown);
      expect(result.portionen).toBe(4);
      expect(result.kochdauer).toBe(30);
      expect(result.schwierigkeit).toBe(2);
    });

    test('handles English section headings', () => {
      const markdown = `# English Recipe

## Ingredients

- 500g Flour
- 2 Eggs

## Instructions

1. Mix flour
2. Add eggs
`;
      const result = parseNotionMarkdown(markdown);
      expect(result.ingredients).toEqual(['500g Flour', '2 Eggs']);
      expect(result.steps).toEqual(['Mix flour', 'Add eggs']);
    });

    test('parses table format (Notion database export)', () => {
      const markdown = `# Recipe

| Property | Value |
|----------|-------|
| Portionen | 4 |
| Schwierigkeit | 3 |
| Kochdauer | 45 |

## Ingredients
- Ingredient 1
## Steps
- Step 1
`;
      const result = parseNotionMarkdown(markdown);
      expect(result.portionen).toBe(4);
      expect(result.schwierigkeit).toBe(3);
      expect(result.kochdauer).toBe(45);
    });

    test('extracts cooking time from text with units', () => {
      const markdown = `# Recipe

Kochdauer: 45 Minuten

## Ingredients
- Ingredient 1
## Steps
- Step 1
`;
      const result = parseNotionMarkdown(markdown);
      expect(result.kochdauer).toBe(45);
    });

    test('clamps difficulty to valid range', () => {
      const markdown1 = `# Recipe
Schwierigkeit: 0
## Ingredients
- Ingredient 1
## Steps
- Step 1
`;
      const markdown2 = `# Recipe
Schwierigkeit: 10
## Ingredients
- Ingredient 1
## Steps
- Step 1
`;

      expect(parseNotionMarkdown(markdown1).schwierigkeit).toBe(1);
      expect(parseNotionMarkdown(markdown2).schwierigkeit).toBe(5);
    });

    test('handles asterisk bullet points', () => {
      const markdown = `# Recipe

## Ingredients

* Ingredient 1
* Ingredient 2

## Steps

* Step 1
* Step 2
`;
      const result = parseNotionMarkdown(markdown);
      expect(result.ingredients).toEqual(['Ingredient 1', 'Ingredient 2']);
      expect(result.steps).toEqual(['Step 1', 'Step 2']);
    });

    test('filters out empty lines and items', () => {
      const markdown = `# Recipe

## Zutaten

- Ingredient 1
-
- Ingredient 2
-    

## Steps
- Step 1

- Step 2
`;
      const result = parseNotionMarkdown(markdown);
      expect(result.ingredients).toEqual(['Ingredient 1', 'Ingredient 2']);
      expect(result.steps).toEqual(['Step 1', 'Step 2']);
    });

    test('extracts image URL from markdown syntax', () => {
      const markdown = `# Recipe

Bild: ![Image](https://example.com/image.jpg)

## Ingredients
- Ingredient 1
## Steps
- Step 1
`;
      const result = parseNotionMarkdown(markdown);
      expect(result.image).toBe('https://example.com/image.jpg');
    });

    test('extracts image URL from plain URL', () => {
      const markdown = `# Recipe

Image: https://example.com/photo.jpg

## Ingredients
- Ingredient 1
## Steps
- Step 1
`;
      const result = parseNotionMarkdown(markdown);
      expect(result.image).toBe('https://example.com/photo.jpg');
    });

    test('throws error for invalid input', () => {
      expect(() => parseNotionMarkdown(null)).toThrow('Ungültiger Markdown-Inhalt');
      expect(() => parseNotionMarkdown('')).toThrow('Ungültiger Markdown-Inhalt');
    });

    test('handles recipe with minimal properties', () => {
      const markdown = `# Simple Recipe

## Ingredients
- Flour
## Steps
- Mix
`;
      const result = parseNotionMarkdown(markdown);
      expect(result.title).toBe('Simple Recipe');
      expect(result.ingredients).toEqual(['Flour']);
      expect(result.steps).toEqual(['Mix']);
      // Should have defaults for other properties
      expect(result.portionen).toBe(4);
      expect(result.schwierigkeit).toBe(3);
    });

    test('handles multiple cuisine types', () => {
      const markdown = `# Recipe

Kulinarik: Italienisch, Mediterran

## Ingredients
- Ingredient 1
## Steps
- Step 1
`;
      const result = parseNotionMarkdown(markdown);
      expect(result.kulinarik).toEqual(['Italienisch', 'Mediterran']);
    });

    test('removes step numbers from bullet list steps', () => {
      const markdown = `# Recipe

## Ingredients
- Ingredient 1

## Zubereitung

- 1. First step
- 2. Second step
- 3. Third step
`;
      const result = parseNotionMarkdown(markdown);
      expect(result.steps).toEqual(['First step', 'Second step', 'Third step']);
    });
  });

  describe('parseNotionCSV', () => {
    test('parses simple CSV with recipe data', () => {
      const csv = `Name,Portionen,Schwierigkeit,Kochdauer,Speisekategorie
Pizza Margherita,4,2,30,Hauptgericht`;

      const result = parseNotionCSV(csv);
      expect(result.title).toBe('Pizza Margherita');
      expect(result.portionen).toBe(4);
      expect(result.schwierigkeit).toBe(2);
      expect(result.kochdauer).toBe(30);
      expect(result.speisekategorie).toBe('Hauptgericht');
    });

    test('handles CSV with quoted values', () => {
      const csv = `Title,Kulinarik,Category
"Test Recipe","Italian, Thai","Main Course"`;

      const result = parseNotionCSV(csv);
      expect(result.title).toBe('Test Recipe');
    });

    test('throws error for invalid CSV', () => {
      expect(() => parseNotionCSV(null)).toThrow('Ungültiger CSV-Inhalt');
      expect(() => parseNotionCSV('')).toThrow('Ungültiger CSV-Inhalt');
    });

    test('throws error for CSV with only headers', () => {
      const csv = 'Name,Portionen,Schwierigkeit';
      expect(() => parseNotionCSV(csv)).toThrow('mindestens Header und eine Datenzeile');
    });

    test('handles German column names', () => {
      const csv = `Rezept,Portionen,Kulinarik
Spaghetti,4,Italienisch`;

      const result = parseNotionCSV(csv);
      expect(result.title).toBe('Spaghetti');
      expect(result.kulinarik).toEqual(['Italienisch']);
    });

    test('ignores empty values', () => {
      const csv = `Name,Portionen,Schwierigkeit,Extra
Test Recipe,4,,`;

      const result = parseNotionCSV(csv);
      expect(result.title).toBe('Test Recipe');
      expect(result.portionen).toBe(4);
      expect(result.schwierigkeit).toBe(3); // Should use default
    });
  });
});
