import {
  parseOcrText,
  EXAMPLE_OCR_TEXT_DE,
  EXAMPLE_OCR_TEXT_EN
} from './ocrParser';
import { parseRecipeData } from './recipeImport';

describe('ocrParser', () => {
  describe('parseOcrText', () => {
    describe('German recipes', () => {
      test('parses example German OCR text correctly', () => {
        const result = parseOcrText(EXAMPLE_OCR_TEXT_DE, 'de');

        expect(result.title).toBe('Spaghetti Carbonara');
        expect(result.portionen).toBe(4);
        expect(result.kochdauer).toBe(30);
        expect(result.ingredients).toHaveLength(5);
        expect(result.steps).toHaveLength(6);
      });

      test('extracts title from first line', () => {
        const text = `Gulasch

Zutaten
500g Rindfleisch
2 Zwiebeln

Zubereitung
1. Fleisch anbraten`;
        
        const result = parseOcrText(text, 'de');
        expect(result.title).toBe('Gulasch');
      });

      test('recognizes German ingredient section (Zutaten)', () => {
        const text = `Test Recipe

Zutaten

500g Mehl
2 Eier
100ml Milch

Zubereitung
1. Mix everything`;

        const result = parseOcrText(text, 'de');
        expect(result.ingredients).toEqual(['500g Mehl', '2 Eier', '100ml Milch']);
      });

      test('recognizes German preparation section (Zubereitung)', () => {
        const text = `Test Recipe

Zutaten
- Ingredient 1

Zubereitung

1. Mehl in eine Schüssel geben
2. Eier hinzufügen
3. Alles vermengen`;

        const result = parseOcrText(text, 'de');
        expect(result.steps).toEqual([
          'Mehl in eine Schüssel geben',
          'Eier hinzufügen',
          'Alles vermengen'
        ]);
      });

      test('parses Portionen property', () => {
        const text = `Recipe

Portionen: 6

Zutaten
- Ingredient 1

Zubereitung
1. Step 1`;

        const result = parseOcrText(text, 'de');
        expect(result.portionen).toBe(6);
      });

      test('parses "für X Personen" pattern', () => {
        const text = `Recipe

für 8 Personen

Zutaten
- Ingredient 1

Zubereitung
1. Step 1`;

        const result = parseOcrText(text, 'de');
        expect(result.portionen).toBe(8);
      });

      test('handles ingredients with quantities (200g, 2 EL)', () => {
        const text = `Recipe

Zutaten

200g Mehl
2 EL Öl
1 TL Salz
500 ml Wasser

Zubereitung
1. Mix`;

        const result = parseOcrText(text, 'de');
        expect(result.ingredients).toContain('200g Mehl');
        expect(result.ingredients).toContain('2 EL Öl');
        expect(result.ingredients).toContain('1 TL Salz');
        expect(result.ingredients).toContain('500 ml Wasser');
      });

      test('handles bullet points in ingredients', () => {
        const text = `Recipe

Zutaten

- 200g Mehl
* 2 Eier
• 100ml Milch

Zubereitung
1. Mix`;

        const result = parseOcrText(text, 'de');
        expect(result.ingredients).toEqual(['200g Mehl', '2 Eier', '100ml Milch']);
      });

      test('handles numbered list in steps', () => {
        const text = `Recipe

Zutaten
- Ingredient

Zubereitung

1. First step
2. Second step
3) Third step with parenthesis`;

        const result = parseOcrText(text, 'de');
        expect(result.steps).toEqual(['First step', 'Second step', 'Third step with parenthesis']);
      });
    });

    describe('English recipes', () => {
      test('parses example English OCR text correctly', () => {
        const result = parseOcrText(EXAMPLE_OCR_TEXT_EN, 'en');

        expect(result.title).toBe('Chocolate Chip Cookies');
        expect(result.portionen).toBe(24);
        expect(result.kochdauer).toBe(25);
        expect(result.ingredients).toHaveLength(7);
        expect(result.steps).toHaveLength(8);
      });

      test('recognizes English ingredient section (Ingredients)', () => {
        const text = `Pancakes

Ingredients

2 cups flour
1 cup milk
2 eggs

Directions
1. Mix all`;

        const result = parseOcrText(text, 'en');
        expect(result.ingredients).toEqual(['2 cups flour', '1 cup milk', '2 eggs']);
      });

      test('recognizes English instruction sections (Instructions)', () => {
        const text = `Recipe

Ingredients
- Flour

Instructions

1. Mix flour
2. Add water
3. Bake`;

        const result = parseOcrText(text, 'en');
        expect(result.steps).toEqual(['Mix flour', 'Add water', 'Bake']);
      });

      test('recognizes English instruction sections (Directions)', () => {
        const text = `Recipe

Ingredients
- Flour

Directions

1. Mix flour
2. Add water`;

        const result = parseOcrText(text, 'en');
        expect(result.steps).toEqual(['Mix flour', 'Add water']);
      });

      test('parses Servings property', () => {
        const text = `Recipe

Servings: 8

Ingredients
- Ingredient 1

Instructions
1. Step 1`;

        const result = parseOcrText(text, 'en');
        expect(result.portionen).toBe(8);
      });

      test('handles English quantities (cups, tbsp, tsp)', () => {
        const text = `Recipe

Ingredients

2 cups flour
1 tbsp oil
1 tsp salt
500 ml water

Instructions
1. Mix`;

        const result = parseOcrText(text, 'en');
        expect(result.ingredients).toContain('2 cups flour');
        expect(result.ingredients).toContain('1 tbsp oil');
        expect(result.ingredients).toContain('1 tsp salt');
      });
    });

    describe('Edge cases and robustness', () => {
      test('handles missing ingredient section (fallback)', () => {
        const text = `Recipe

Zubereitung
1. Do something`;

        const result = parseOcrText(text, 'de');
        expect(result.ingredients).toEqual([]);
      });

      test('handles missing steps section (fallback)', () => {
        const text = `Recipe

Zutaten
- Ingredient 1`;

        const result = parseOcrText(text, 'de');
        expect(result.steps).toEqual([]);
      });

      test('provides fallback title when no title found', () => {
        const text = `Zutaten
- Ingredient 1

Zubereitung
1. Step 1`;

        const result = parseOcrText(text, 'de');
        expect(result.title).toBe('OCR-Rezept');
      });

      test('provides English fallback title when lang is en', () => {
        const text = `Ingredients
- Ingredient 1

Instructions
1. Step 1`;

        const result = parseOcrText(text, 'en');
        expect(result.title).toBe('OCR Recipe');
      });

      test('filters out empty lines in ingredients', () => {
        const text = `Recipe

Zutaten

200g Flour

2 Eggs

Zubereitung
1. Mix`;

        const result = parseOcrText(text, 'de');
        expect(result.ingredients).toEqual(['200g Flour', '2 Eggs']);
      });

      test('filters out empty lines in steps', () => {
        const text = `Recipe

Zutaten
- Ingredient

Zubereitung

1. First step

2. Second step

`;

        const result = parseOcrText(text, 'de');
        expect(result.steps).toEqual(['First step', 'Second step']);
      });

      test('throws error for invalid input (null)', () => {
        expect(() => parseOcrText(null)).toThrow('Ungültiger OCR-Text');
      });

      test('throws error for invalid input (non-string)', () => {
        expect(() => parseOcrText(123)).toThrow('Ungültiger OCR-Text');
      });

      test('handles section headers with formatting markers', () => {
        const text = `Recipe

## Zutaten

- Ingredient 1

## Zubereitung

1. Step 1`;

        const result = parseOcrText(text, 'de');
        expect(result.ingredients).toEqual(['Ingredient 1']);
        expect(result.steps).toEqual(['Step 1']);
      });

      test('handles mixed case section headers', () => {
        const text = `Recipe

ZUTATEN

- Ingredient 1

ZUBEREITUNG

1. Step 1`;

        const result = parseOcrText(text, 'de');
        expect(result.ingredients).toEqual(['Ingredient 1']);
        expect(result.steps).toEqual(['Step 1']);
      });
    });

    describe('Property parsing', () => {
      test('parses Kochdauer/Time property', () => {
        const text = `Recipe

Kochdauer: 45

Zutaten
- Ingredient 1

Zubereitung
1. Step 1`;

        const result = parseOcrText(text, 'de');
        expect(result.kochdauer).toBe(45);
      });

      test('parses cooking time with "min" or "minutes"', () => {
        const text = `Recipe

Time: 60 minutes

Ingredients
- Ingredient 1

Instructions
1. Step 1`;

        const result = parseOcrText(text, 'en');
        expect(result.kochdauer).toBe(60);
      });

      test('parses Kulinarik/Cuisine property', () => {
        const text = `Recipe

Kulinarik: Italienisch, Mediterran

Zutaten
- Ingredient 1

Zubereitung
1. Step 1`;

        const result = parseOcrText(text, 'de');
        expect(result.kulinarik).toEqual(['Italienisch', 'Mediterran']);
      });

      test('parses Schwierigkeit/Difficulty property', () => {
        const text = `Recipe

Schwierigkeit: 4

Zutaten
- Ingredient 1

Zubereitung
1. Step 1`;

        const result = parseOcrText(text, 'de');
        expect(result.schwierigkeit).toBe(4);
      });

      test('parses Kategorie/Category property', () => {
        const text = `Recipe

Kategorie: Hauptgericht

Zutaten
- Ingredient 1

Zubereitung
1. Step 1`;

        const result = parseOcrText(text, 'de');
        expect(result.speisekategorie).toBe('Hauptgericht');
      });
    });

    describe('Compatibility with parseRecipeData', () => {
      test('returns object with all required fields', () => {
        const text = `Test Recipe

Zutaten
- 200g Mehl

Zubereitung
1. Mix`;

        const result = parseOcrText(text, 'de');

        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('image');
        expect(result).toHaveProperty('portionen');
        expect(result).toHaveProperty('kulinarik');
        expect(result).toHaveProperty('schwierigkeit');
        expect(result).toHaveProperty('kochdauer');
        expect(result).toHaveProperty('speisekategorie');
        expect(result).toHaveProperty('ingredients');
        expect(result).toHaveProperty('steps');
      });

      test('ingredients is an array', () => {
        const result = parseOcrText(EXAMPLE_OCR_TEXT_DE, 'de');
        expect(Array.isArray(result.ingredients)).toBe(true);
      });

      test('steps is an array', () => {
        const result = parseOcrText(EXAMPLE_OCR_TEXT_DE, 'de');
        expect(Array.isArray(result.steps)).toBe(true);
      });

      test('kulinarik is an array', () => {
        const result = parseOcrText(EXAMPLE_OCR_TEXT_DE, 'de');
        expect(Array.isArray(result.kulinarik)).toBe(true);
      });

      test('German OCR output is compatible with parseRecipeData', () => {
        const ocrResult = parseOcrText(EXAMPLE_OCR_TEXT_DE, 'de');
        
        // Should not throw any errors
        expect(() => parseRecipeData(ocrResult)).not.toThrow();
        
        const validated = parseRecipeData(ocrResult);
        expect(validated.title).toBe('Spaghetti Carbonara');
        expect(validated.ingredients.length).toBeGreaterThan(0);
        expect(validated.steps.length).toBeGreaterThan(0);
      });

      test('English OCR output is compatible with parseRecipeData', () => {
        const ocrResult = parseOcrText(EXAMPLE_OCR_TEXT_EN, 'en');
        
        // Should not throw any errors
        expect(() => parseRecipeData(ocrResult)).not.toThrow();
        
        const validated = parseRecipeData(ocrResult);
        expect(validated.title).toBe('Chocolate Chip Cookies');
        expect(validated.ingredients.length).toBeGreaterThan(0);
        expect(validated.steps.length).toBeGreaterThan(0);
      });
    });

    describe('Bullet point filtering', () => {
      test('ignores standalone bullet points', () => {
        const text = `Recipe

Zutaten

-
200g Mehl
•
2 Eier
*

Zubereitung
1. Mix ingredients`;

        const result = parseOcrText(text, 'de');
        expect(result.ingredients).toEqual(['200g Mehl', '2 Eier']);
      });

      test('ignores multiple consecutive bullet points', () => {
        const text = `Recipe

Zutaten

-
-
-
200g Mehl

Zubereitung
1. Mix`;

        const result = parseOcrText(text, 'de');
        expect(result.ingredients).toEqual(['200g Mehl']);
      });

      test('does not ignore bullet points with content', () => {
        const text = `Recipe

Zutaten

- 200g Mehl
- 2 Eier

Zubereitung
1. Mix`;

        const result = parseOcrText(text, 'de');
        expect(result.ingredients).toEqual(['200g Mehl', '2 Eier']);
      });
    });

    describe('Intelligent step merging', () => {
      test('merges multi-line steps without sentence endings', () => {
        const text = `Recipe

Zutaten
- Mehl

Zubereitung

1. Den Ofen vorheizen und
das Backblech vorbereiten
2. Mehl in eine Schüssel geben`;

        const result = parseOcrText(text, 'de');
        expect(result.steps).toEqual([
          'Den Ofen vorheizen und das Backblech vorbereiten',
          'Mehl in eine Schüssel geben'
        ]);
      });

      test('does not merge steps that end with period', () => {
        const text = `Recipe

Zutaten
- Mehl

Zubereitung

Den Ofen vorheizen.
Das Backblech vorbereiten.
Mehl in eine Schüssel geben.`;

        const result = parseOcrText(text, 'de');
        expect(result.steps).toEqual([
          'Den Ofen vorheizen.',
          'Das Backblech vorbereiten.',
          'Mehl in eine Schüssel geben.'
        ]);
      });

      test('merges continuation lines with numbered steps', () => {
        const text = `Recipe

Zutaten
- Mehl

Zubereitung

1. Den Ofen auf 180°C vorheizen
und ein Backblech mit
Backpapier auslegen
2. Mehl und Zucker vermischen`;

        const result = parseOcrText(text, 'de');
        expect(result.steps).toEqual([
          'Den Ofen auf 180°C vorheizen und ein Backblech mit Backpapier auslegen',
          'Mehl und Zucker vermischen'
        ]);
      });

      test('handles mixed numbered and non-numbered lines', () => {
        const text = `Recipe

Zutaten
- Mehl

Zubereitung

1. First step
continues here
2. Second step`;

        const result = parseOcrText(text, 'en');
        expect(result.steps).toEqual([
          'First step continues here',
          'Second step'
        ]);
      });

      test('respects question marks and exclamation marks as sentence endings', () => {
        const text = `Recipe

Zutaten
- Mehl

Zubereitung

Is the oven ready?
Preheat to 180°C!
Mix ingredients.`;

        const result = parseOcrText(text, 'en');
        expect(result.steps).toEqual([
          'Is the oven ready?',
          'Preheat to 180°C!',
          'Mix ingredients.'
        ]);
      });

      test('handles steps without any numbering', () => {
        const text = `Recipe

Zutaten
- Mehl

Zubereitung

Preheat the oven to 180°C.
Mix flour and sugar together.
Bake for 20 minutes.`;

        const result = parseOcrText(text, 'en');
        expect(result.steps).toEqual([
          'Preheat the oven to 180°C.',
          'Mix flour and sugar together.',
          'Bake for 20 minutes.'
        ]);
      });

      test('handles steps with parenthesis numbering', () => {
        const text = `Recipe

Zutaten
- Mehl

Zubereitung

1) First step
continues on next line
2) Second step`;

        const result = parseOcrText(text, 'en');
        expect(result.steps).toEqual([
          'First step continues on next line',
          'Second step'
        ]);
      });

      test('handles complex multi-paragraph steps', () => {
        const text = `Recipe

Zutaten
- 500g Mehl

Zubereitung

1. Den Backofen auf 180°C
Ober-/Unterhitze vorheizen.
Ein Backblech mit
Backpapier auslegen.
2. In einer großen Schüssel Mehl,
Zucker und Salz vermischen
3. Die Butter hinzufügen.`;

        const result = parseOcrText(text, 'de');
        expect(result.steps).toEqual([
          'Den Backofen auf 180°C Ober-/Unterhitze vorheizen. Ein Backblech mit Backpapier auslegen.',
          'In einer großen Schüssel Mehl, Zucker und Salz vermischen',
          'Die Butter hinzufügen.'
        ]);
      });

      test('preserves original punctuation in merged steps', () => {
        const text = `Recipe

Zutaten
- Mehl

Zubereitung

1. Step with period.
2. Step without period
3. Another with period.`;

        const result = parseOcrText(text, 'en');
        // Punctuation from original text is preserved
        expect(result.steps).toEqual([
          'Step with period.',
          'Step without period',
          'Another with period.'
        ]);
      });

      test('handles periods at end of continuation lines', () => {
        const text = `Recipe

Zutaten
- Flour

Zubereitung

1. First sentence.
Second sentence (no period)
2. Another step`;

        const result = parseOcrText(text, 'en');
        // Continuation lines without periods are merged
        // Lines ending with period start new step when next line is numbered
        expect(result.steps).toEqual([
          'First sentence.',
          'Second sentence (no period)',
          'Another step'
        ]);
      });
    });
  });
});
