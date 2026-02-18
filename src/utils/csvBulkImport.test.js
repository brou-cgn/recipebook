import { parseBulkCSV, EXAMPLE_CSV } from './csvBulkImport';

describe('csvBulkImport', () => {
  describe('parseBulkCSV', () => {
    test('parses simple CSV with one recipe', () => {
      const csv = `Name,Portionen,Schwierigkeit,Zutat1,Zubereitungsschritt1
Test Recipe,4,3,Ingredient 1,Step 1`;

      const recipes = parseBulkCSV(csv);

      expect(recipes).toHaveLength(1);
      expect(recipes[0].title).toBe('Test Recipe');
      expect(recipes[0].portionen).toBe(4);
      expect(recipes[0].schwierigkeit).toBe(3);
      expect(recipes[0].ingredients).toHaveLength(1);
      expect(recipes[0].ingredients[0]).toEqual({ type: 'ingredient', text: 'Ingredient 1' });
      expect(recipes[0].steps).toHaveLength(1);
      expect(recipes[0].steps[0]).toEqual({ type: 'step', text: 'Step 1' });
      expect(recipes[0].isPrivate).toBe(true);
    });

    test('parses CSV with multiple recipes', () => {
      const csv = `Name,Zutat1,Zubereitungsschritt1
Recipe 1,Ingredient A,Step A
Recipe 2,Ingredient B,Step B
Recipe 3,Ingredient C,Step C`;

      const recipes = parseBulkCSV(csv);

      expect(recipes).toHaveLength(3);
      expect(recipes[0].title).toBe('Recipe 1');
      expect(recipes[1].title).toBe('Recipe 2');
      expect(recipes[2].title).toBe('Recipe 3');
    });

    test('handles comma-separated kulinarik values', () => {
      const csv = `Name,Kulinarik,Zutat1,Zubereitungsschritt1
Test Recipe,"Italienisch,Asiatisch,Mediterran",Ingredient 1,Step 1`;

      const recipes = parseBulkCSV(csv);

      expect(recipes[0].kulinarik).toEqual(['Italienisch', 'Asiatisch', 'Mediterran']);
    });

    test('handles comma-separated speisekategorie values', () => {
      const csv = `Name,Speisenkategorie,Zutat1,Zubereitungsschritt1
Test Recipe,"Hauptgericht,Vegetarisch",Ingredient 1,Step 1`;

      const recipes = parseBulkCSV(csv);

      expect(recipes[0].speisekategorie).toEqual(['Hauptgericht', 'Vegetarisch']);
    });

    test('parses portion with unit', () => {
      const csv = `Name,Portionen,Zutat1,Zubereitungsschritt1
Recipe 1,4 Portionen,Ingredient,Step
Recipe 2,6 Personen,Ingredient,Step
Recipe 3,8,Ingredient,Step`;

      const recipes = parseBulkCSV(csv);

      expect(recipes[0].portionen).toBe(4);
      expect(recipes[0].portionUnitId).toBe('portion');
      expect(recipes[1].portionen).toBe(6);
      expect(recipes[1].portionUnitId).toBe('person');
      expect(recipes[2].portionen).toBe(8);
    });

    test('detects ingredient headers with ###', () => {
      const csv = `Name,Zutat1,Zutat2,Zutat3,Zubereitungsschritt1
Test Recipe,###Teig,500g Mehl,200ml Wasser,Mix ingredients`;

      const recipes = parseBulkCSV(csv);

      expect(recipes[0].ingredients).toHaveLength(3);
      expect(recipes[0].ingredients[0]).toEqual({ type: 'heading', text: 'Teig' });
      expect(recipes[0].ingredients[1]).toEqual({ type: 'ingredient', text: '500g Mehl' });
      expect(recipes[0].ingredients[2]).toEqual({ type: 'ingredient', text: '200ml Wasser' });
    });

    test('detects step headers with ###', () => {
      const csv = `Name,Zutat1,Zubereitungsschritt1,Zubereitungsschritt2,Zubereitungsschritt3
Test Recipe,Ingredient,###Vorbereitung,Mix,###Backen`;

      const recipes = parseBulkCSV(csv);

      expect(recipes[0].steps).toHaveLength(3);
      expect(recipes[0].steps[0]).toEqual({ type: 'heading', text: 'Vorbereitung' });
      expect(recipes[0].steps[1]).toEqual({ type: 'step', text: 'Mix' });
      expect(recipes[0].steps[2]).toEqual({ type: 'heading', text: 'Backen' });
    });

    test('handles multiple ingredient and step columns', () => {
      const csv = `Name,Zutat1,Zutat2,Zutat3,Zubereitungsschritt1,Zubereitungsschritt2
Test Recipe,Ing 1,Ing 2,Ing 3,Step 1,Step 2`;

      const recipes = parseBulkCSV(csv);

      expect(recipes[0].ingredients).toHaveLength(3);
      expect(recipes[0].steps).toHaveLength(2);
    });

    test('skips empty ingredient and step fields', () => {
      const csv = `Name,Zutat1,Zutat2,Zutat3,Zubereitungsschritt1,Zubereitungsschritt2
Test Recipe,Ing 1,,Ing 3,Step 1,`;

      const recipes = parseBulkCSV(csv);

      expect(recipes[0].ingredients).toHaveLength(2);
      expect(recipes[0].steps).toHaveLength(1);
    });

    test('parses difficulty as number 1-5', () => {
      const csv = `Name,Schwierigkeit,Zutat1,Zubereitungsschritt1
Easy,1,Ingredient,Step
Medium,3,Ingredient,Step
Hard,5,Ingredient,Step
Invalid,10,Ingredient,Step`;

      const recipes = parseBulkCSV(csv);

      expect(recipes[0].schwierigkeit).toBe(1);
      expect(recipes[1].schwierigkeit).toBe(3);
      expect(recipes[2].schwierigkeit).toBe(5);
      expect(recipes[3].schwierigkeit).toBe(5); // Clamped to max
    });

    test('parses cooking time in minutes', () => {
      const csv = `Name,Zubereitung,Zutat1,Zubereitungsschritt1
Fast,15,Ingredient,Step
Medium,45,Ingredient,Step
Slow,120,Ingredient,Step`;

      const recipes = parseBulkCSV(csv);

      expect(recipes[0].kochdauer).toBe(15);
      expect(recipes[1].kochdauer).toBe(45);
      expect(recipes[2].kochdauer).toBe(120);
    });

    test('stores author name and created date', () => {
      const csv = `Name,Erstellt am,Erstellt von,Zutat1,Zubereitungsschritt1
Test Recipe,2024-01-15,Max Mustermann,Ingredient,Step`;

      const recipes = parseBulkCSV(csv);

      expect(recipes[0].createdAtStr).toBe('2024-01-15');
      expect(recipes[0].authorName).toBe('Max Mustermann');
    });

    test('handles quoted values with commas', () => {
      const csv = `Name,Kulinarik,Zutat1,Zubereitungsschritt1
"Recipe, Special Name","Italian, Asian",Ingredient,Step`;

      const recipes = parseBulkCSV(csv);

      expect(recipes[0].title).toBe('Recipe, Special Name');
      expect(recipes[0].kulinarik).toEqual(['Italian', 'Asian']);
    });

    test('handles escaped quotes in values', () => {
      const csv = `Name,Zutat1,Zubereitungsschritt1
Test Recipe,"Ingredient with ""quote""",Step`;

      const recipes = parseBulkCSV(csv);

      expect(recipes[0].ingredients[0].text).toBe('Ingredient with "quote"');
    });

    test('throws error for CSV without headers', () => {
      const csv = `Test Recipe,4,3`;

      expect(() => parseBulkCSV(csv)).toThrow('mindestens Header');
    });

    test('throws error for recipe without name', () => {
      const csv = `Name,Zutat1,Zubereitungsschritt1
,Ingredient,Step`;

      expect(() => parseBulkCSV(csv)).toThrow('Rezeptname fehlt');
    });

    test('throws error for recipe without ingredients', () => {
      const csv = `Name,Zubereitungsschritt1
Test Recipe,Step`;

      expect(() => parseBulkCSV(csv)).toThrow('Mindestens eine Zutat');
    });

    test('throws error for recipe without steps', () => {
      const csv = `Name,Zutat1
Test Recipe,Ingredient`;

      expect(() => parseBulkCSV(csv)).toThrow('Mindestens ein Zubereitungsschritt');
    });

    test('throws error for empty CSV content', () => {
      expect(() => parseBulkCSV('')).toThrow('Ungültiger CSV-Inhalt');
    });

    test('parses EXAMPLE_CSV without errors', () => {
      const recipes = parseBulkCSV(EXAMPLE_CSV);

      expect(recipes.length).toBeGreaterThan(0);
      recipes.forEach(recipe => {
        expect(recipe.title).toBeTruthy();
        expect(recipe.ingredients.length).toBeGreaterThan(0);
        expect(recipe.steps.length).toBeGreaterThan(0);
      });
    });

    test('continues parsing valid rows when some rows fail', () => {
      // Spy on console.warn to verify warning is logged
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const csv = `Name,Zutat1,Zubereitungsschritt1
Good Recipe 1,Ingredient,Step
,Missing Name,Step
Good Recipe 2,Ingredient,Step`;

      // Should parse 2 recipes, skip the invalid one
      const recipes = parseBulkCSV(csv);

      expect(recipes).toHaveLength(2);
      expect(recipes[0].title).toBe('Good Recipe 1');
      expect(recipes[1].title).toBe('Good Recipe 2');
      
      // Verify console.warn was called with error information
      expect(consoleSpy).toHaveBeenCalledWith(
        'Einige Rezepte konnten nicht importiert werden:',
        expect.arrayContaining([expect.stringContaining('Rezeptname fehlt')])
      );

      consoleSpy.mockRestore();
    });
  });
});
