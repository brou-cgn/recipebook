import { parseBulkCSV, EXAMPLE_CSV } from './csvBulkImport';

describe('csvBulkImport', () => {
  describe('parseBulkCSV', () => {
    test('parses simple CSV with one recipe', async () => {
      const csv = `Name,Portionen,Schwierigkeit,Zutat1,Zubereitungsschritt1
Test Recipe,4,3,Ingredient 1,Step 1`;

      const recipes = await parseBulkCSV(csv);

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

    test('parses CSV with multiple recipes', async () => {
      const csv = `Name,Zutat1,Zubereitungsschritt1
Recipe 1,Ingredient A,Step A
Recipe 2,Ingredient B,Step B
Recipe 3,Ingredient C,Step C`;

      const recipes = await parseBulkCSV(csv);

      expect(recipes).toHaveLength(3);
      expect(recipes[0].title).toBe('Recipe 1');
      expect(recipes[1].title).toBe('Recipe 2');
      expect(recipes[2].title).toBe('Recipe 3');
    });

    test('handles comma-separated kulinarik values', async () => {
      const csv = `Name,Kulinarik,Zutat1,Zubereitungsschritt1
Test Recipe,"Italienisch,Asiatisch,Mediterran",Ingredient 1,Step 1`;

      const recipes = await parseBulkCSV(csv);

      expect(recipes[0].kulinarik).toEqual(['Italienisch', 'Asiatisch', 'Mediterran']);
    });

    test('handles comma-separated speisekategorie values', async () => {
      const csv = `Name,Speisenkategorie,Zutat1,Zubereitungsschritt1
Test Recipe,"Hauptgericht,Vegetarisch",Ingredient 1,Step 1`;

      const recipes = await parseBulkCSV(csv);

      expect(recipes[0].speisekategorie).toEqual(['Hauptgericht', 'Vegetarisch']);
    });

    test('parses portion with unit', async () => {
      const csv = `Name,Portionen,Zutat1,Zubereitungsschritt1
Recipe 1,4 Portionen,Ingredient,Step
Recipe 2,6 Personen,Ingredient,Step
Recipe 3,8,Ingredient,Step`;

      const recipes = await parseBulkCSV(csv);

      expect(recipes[0].portionen).toBe(4);
      expect(recipes[0].portionUnitId).toBe('portion');
      expect(recipes[1].portionen).toBe(6);
      expect(recipes[1].portionUnitId).toBe('person');
      expect(recipes[2].portionen).toBe(8);
    });

    test('detects ingredient headers with ###', async () => {
      const csv = `Name,Zutat1,Zutat2,Zutat3,Zubereitungsschritt1
Test Recipe,###Teig,500g Mehl,200ml Wasser,Mix ingredients`;

      const recipes = await parseBulkCSV(csv);

      expect(recipes[0].ingredients).toHaveLength(3);
      expect(recipes[0].ingredients[0]).toEqual({ type: 'heading', text: 'Teig' });
      expect(recipes[0].ingredients[1]).toEqual({ type: 'ingredient', text: '500g Mehl' });
      expect(recipes[0].ingredients[2]).toEqual({ type: 'ingredient', text: '200ml Wasser' });
    });

    test('detects step headers with ###', async () => {
      const csv = `Name,Zutat1,Zubereitungsschritt1,Zubereitungsschritt2,Zubereitungsschritt3
Test Recipe,Ingredient,###Vorbereitung,Mix,###Backen`;

      const recipes = await parseBulkCSV(csv);

      expect(recipes[0].steps).toHaveLength(3);
      expect(recipes[0].steps[0]).toEqual({ type: 'heading', text: 'Vorbereitung' });
      expect(recipes[0].steps[1]).toEqual({ type: 'step', text: 'Mix' });
      expect(recipes[0].steps[2]).toEqual({ type: 'heading', text: 'Backen' });
    });

    test('handles multiple ingredient and step columns', async () => {
      const csv = `Name,Zutat1,Zutat2,Zutat3,Zubereitungsschritt1,Zubereitungsschritt2
Test Recipe,Ing 1,Ing 2,Ing 3,Step 1,Step 2`;

      const recipes = await parseBulkCSV(csv);

      expect(recipes[0].ingredients).toHaveLength(3);
      expect(recipes[0].steps).toHaveLength(2);
    });

    test('skips empty ingredient and step fields', async () => {
      const csv = `Name,Zutat1,Zutat2,Zutat3,Zubereitungsschritt1,Zubereitungsschritt2
Test Recipe,Ing 1,,Ing 3,Step 1,`;

      const recipes = await parseBulkCSV(csv);

      expect(recipes[0].ingredients).toHaveLength(2);
      expect(recipes[0].steps).toHaveLength(1);
    });

    test('parses difficulty as number 1-5', async () => {
      const csv = `Name,Schwierigkeit,Zutat1,Zubereitungsschritt1
Easy,1,Ingredient,Step
Medium,3,Ingredient,Step
Hard,5,Ingredient,Step
Invalid,10,Ingredient,Step`;

      const recipes = await parseBulkCSV(csv);

      expect(recipes[0].schwierigkeit).toBe(1);
      expect(recipes[1].schwierigkeit).toBe(3);
      expect(recipes[2].schwierigkeit).toBe(5);
      expect(recipes[3].schwierigkeit).toBe(5); // Clamped to max
    });

    test('parses cooking time in minutes', async () => {
      const csv = `Name,Zubereitung,Zutat1,Zubereitungsschritt1
Fast,15,Ingredient,Step
Medium,45,Ingredient,Step
Slow,120,Ingredient,Step`;

      const recipes = await parseBulkCSV(csv);

      expect(recipes[0].kochdauer).toBe(15);
      expect(recipes[1].kochdauer).toBe(45);
      expect(recipes[2].kochdauer).toBe(120);
    });

    test('stores author name and created date', async () => {
      const csv = `Name,Erstellt am,Erstellt von,Zutat1,Zubereitungsschritt1
Test Recipe,2024-01-15,Max Mustermann,Ingredient,Step`;

      const recipes = await parseBulkCSV(csv);

      expect(recipes[0].createdAtStr).toBe('2024-01-15');
      expect(recipes[0].authorName).toBe('Max Mustermann');
    });

    test('handles quoted values with commas', async () => {
      const csv = `Name,Kulinarik,Zutat1,Zubereitungsschritt1
"Recipe, Special Name","Italian, Asian",Ingredient,Step`;

      const recipes = await parseBulkCSV(csv);

      expect(recipes[0].title).toBe('Recipe, Special Name');
      expect(recipes[0].kulinarik).toEqual(['Italian', 'Asian']);
    });

    test('handles escaped quotes in values', async () => {
      const csv = `Name,Zutat1,Zubereitungsschritt1
Test Recipe,"Ingredient with ""quote""",Step`;

      const recipes = await parseBulkCSV(csv);

      expect(recipes[0].ingredients[0].text).toBe('Ingredient with "quote"');
    });

    test('throws error for CSV without headers', async () => {
      const csv = `Test Recipe,4,3`;

      await expect(parseBulkCSV(csv)).rejects.toThrow('mindestens Header');
    });

    test('throws error for recipe without name', async () => {
      const csv = `Name,Zutat1,Zubereitungsschritt1
,Ingredient,Step`;

      await expect(parseBulkCSV(csv)).rejects.toThrow('Rezeptname fehlt');
    });

    test('throws error for recipe without ingredients', async () => {
      const csv = `Name,Zubereitungsschritt1
Test Recipe,Step`;

      await expect(parseBulkCSV(csv)).rejects.toThrow('Mindestens eine Zutat');
    });

    test('throws error for recipe without steps', async () => {
      const csv = `Name,Zutat1
Test Recipe,Ingredient`;

      await expect(parseBulkCSV(csv)).rejects.toThrow('Mindestens ein Zubereitungsschritt');
    });

    test('throws error for empty CSV content', async () => {
      await expect(parseBulkCSV('')).rejects.toThrow('Ungültiger CSV-Inhalt');
    });

    test('parses EXAMPLE_CSV without errors', async () => {
      const recipes = await parseBulkCSV(EXAMPLE_CSV);

      expect(recipes.length).toBeGreaterThan(0);
      recipes.forEach(recipe => {
        expect(recipe.title).toBeTruthy();
        expect(recipe.ingredients.length).toBeGreaterThan(0);
        expect(recipe.steps.length).toBeGreaterThan(0);
      });
    });

    test('continues parsing valid rows when some rows fail', async () => {
      // Spy on console.warn to verify warning is logged
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const csv = `Name,Zutat1,Zubereitungsschritt1
Good Recipe 1,Ingredient,Step
,Missing Name,Step
Good Recipe 2,Ingredient,Step`;

      // Should parse 2 recipes, skip the invalid one
      const recipes = await parseBulkCSV(csv);

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

    // Tests for semicolon-delimited CSV files
    test('parses semicolon-delimited CSV with one recipe', async () => {
      const csv = `Name;Portionen;Schwierigkeit;Zutat1;Zubereitungsschritt1
Test Recipe;4;3;Ingredient 1;Step 1`;

      const recipes = await parseBulkCSV(csv);

      expect(recipes).toHaveLength(1);
      expect(recipes[0].title).toBe('Test Recipe');
      expect(recipes[0].portionen).toBe(4);
      expect(recipes[0].schwierigkeit).toBe(3);
      expect(recipes[0].ingredients).toHaveLength(1);
      expect(recipes[0].ingredients[0]).toEqual({ type: 'ingredient', text: 'Ingredient 1' });
      expect(recipes[0].steps).toHaveLength(1);
      expect(recipes[0].steps[0]).toEqual({ type: 'step', text: 'Step 1' });
    });

    test('parses semicolon-delimited CSV with multiple recipes', async () => {
      const csv = `Name;Zutat1;Zubereitungsschritt1
Recipe 1;Ingredient A;Step A
Recipe 2;Ingredient B;Step B
Recipe 3;Ingredient C;Step C`;

      const recipes = await parseBulkCSV(csv);

      expect(recipes).toHaveLength(3);
      expect(recipes[0].title).toBe('Recipe 1');
      expect(recipes[1].title).toBe('Recipe 2');
      expect(recipes[2].title).toBe('Recipe 3');
    });

    test('parses semicolon-delimited CSV from the bug report', async () => {
      const csv = `Name;Erstellt am;Erstellt von;Kulinarik;Speisenkategorie;Portionen;Zubereitung;Schwierigkeit;Zutat1;Zubereitungsschritt1
Babybrokkoli mit Weihnachtsbutter;27.11.2024;Benjamin Rousselli;Vegan;Gemüse;4;30;3;500g Brokkoli;Brokkoli kochen
Pizza Bianco al Tartufo;08.02.2026;Benjamin Rousselli;Italienische Küche;Hauptgericht;2;25;4;300g Mehl;Teig zubereiten`;

      const recipes = await parseBulkCSV(csv);

      expect(recipes).toHaveLength(2);
      expect(recipes[0].title).toBe('Babybrokkoli mit Weihnachtsbutter');
      expect(recipes[0].authorName).toBe('Benjamin Rousselli');
      expect(recipes[0].createdAtStr).toBe('27.11.2024');
      expect(recipes[1].title).toBe('Pizza Bianco al Tartufo');
      expect(recipes[1].authorName).toBe('Benjamin Rousselli');
      expect(recipes[1].createdAtStr).toBe('08.02.2026');
    });

    test('handles semicolon-delimited CSV with quoted values containing semicolons', async () => {
      const csv = `Name;Kulinarik;Zutat1;Zubereitungsschritt1
"Recipe; Special Name";"Italian, Asian";Ingredient;Step`;

      const recipes = await parseBulkCSV(csv);

      expect(recipes[0].title).toBe('Recipe; Special Name');
      expect(recipes[0].kulinarik).toEqual(['Italian', 'Asian']);
    });

    test('removes numbering from preparation steps', async () => {
      const csv = `Name;Zutat1;Zubereitungsschritt1;Zubereitungsschritt2;Zubereitungsschritt3;Zubereitungsschritt4;Zubereitungsschritt5
Test Recipe;Ingredient;1. First step;2) Second step;3 - Third step;4: Fourth step;5. Fifth step`;

      const recipes = await parseBulkCSV(csv);

      expect(recipes[0].steps).toHaveLength(5);
      expect(recipes[0].steps[0]).toEqual({ type: 'step', text: 'First step' });
      expect(recipes[0].steps[1]).toEqual({ type: 'step', text: 'Second step' });
      expect(recipes[0].steps[2]).toEqual({ type: 'step', text: 'Third step' });
      expect(recipes[0].steps[3]).toEqual({ type: 'step', text: 'Fourth step' });
      expect(recipes[0].steps[4]).toEqual({ type: 'step', text: 'Fifth step' });
    });

    test('does not remove numbering from ingredients', async () => {
      const csv = `Name;Zutat1;Zutat2;Zubereitungsschritt1
Test Recipe;1. 500g Flour;2. 200ml Water;Mix ingredients`;

      const recipes = await parseBulkCSV(csv);

      expect(recipes[0].ingredients).toHaveLength(2);
      expect(recipes[0].ingredients[0]).toEqual({ type: 'ingredient', text: '1. 500g Flour' });
      expect(recipes[0].ingredients[1]).toEqual({ type: 'ingredient', text: '2. 200ml Water' });
    });

    test('handles UTF-8 BOM in CSV content', async () => {
      // Create CSV with BOM character
      const csvWithBOM = '\uFEFF' + `Name;Zutat1;Zubereitungsschritt1
Käsespätzle;500g Mehl;Teig kneten`;

      const recipes = await parseBulkCSV(csvWithBOM);

      expect(recipes).toHaveLength(1);
      expect(recipes[0].title).toBe('Käsespätzle');
      expect(recipes[0].ingredients[0].text).toBe('500g Mehl');
    });

    test('applies category images when getCategoryImage function provided', async () => {
      const mockGetCategoryImage = jest.fn(async (categories) => {
        if (categories.includes('Hauptgericht')) {
          return 'base64-image-main-dish';
        }
        return null;
      });

      const csv = `Name;Speisenkategorie;Zutat1;Zubereitungsschritt1
Test Recipe;Hauptgericht;Ingredient;Step`;

      const recipes = await parseBulkCSV(csv, '', mockGetCategoryImage);

      expect(recipes[0].image).toBe('base64-image-main-dish');
      expect(mockGetCategoryImage).toHaveBeenCalledWith(['Hauptgericht']);
    });

    test('applies category image when recipe has no image', async () => {
      const mockGetCategoryImage = jest.fn(async () => 'base64-category-image');

      const csv = `Name;Speisenkategorie;Zutat1;Zubereitungsschritt1
Test Recipe;Hauptgericht;Ingredient;Step`;

      const recipes = await parseBulkCSV(csv, '', mockGetCategoryImage);

      // Since recipe.image starts as '' and we have category, it should apply
      expect(recipes[0].image).toBe('base64-category-image');
    });

    test('handles recipes without meal categories for image assignment', async () => {
      const mockGetCategoryImage = jest.fn(async () => 'base64-category-image');

      const csv = `Name;Zutat1;Zubereitungsschritt1
Test Recipe;Ingredient;Step`;

      const recipes = await parseBulkCSV(csv, '', mockGetCategoryImage);

      expect(recipes[0].image).toBe('');
      expect(mockGetCategoryImage).not.toHaveBeenCalled();
    });

    test('properly awaits async getCategoryImage function to avoid Promise objects', async () => {
      // This test verifies the fix for the bug where Promise objects were being stored
      const mockGetCategoryImage = jest.fn(async (categories) => {
        // Simulate async operation (like reading from Firestore)
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'base64-async-image';
      });

      const csv = `Name;Speisenkategorie;Zutat1;Zubereitungsschritt1
Test Recipe;Hauptgericht;Ingredient;Step`;

      const recipes = await parseBulkCSV(csv, '', mockGetCategoryImage);

      // Verify that the image is a string, not a Promise
      expect(typeof recipes[0].image).toBe('string');
      expect(recipes[0].image).toBe('base64-async-image');
      // Verify it's not a Promise object
      expect(recipes[0].image).not.toHaveProperty('then');
    });

    test('handles German umlauts (ä, ö, ü, ß) in recipe names and ingredients', async () => {
      const csv = `Name;Portionen;Schwierigkeit;Zutat1;Zutat2;Zutat3;Zubereitungsschritt1;Zubereitungsschritt2
Käsespätzle;4;3;500g Mehl;250g Käse;Butter;Teig kneten und Spätzle formen;Mit Käse überbacken
Apfelstrudel;6;4;6 Äpfel;200g Mürbeteig;Zucker;Äpfel schälen und würfeln;Im Ofen backen
Öl-Brot;2;1;300g Mehl;50ml Öl;Salz;Mehl mit Öl verkneten;Backen`;

      const recipes = await parseBulkCSV(csv);

      expect(recipes).toHaveLength(3);
      
      // Check first recipe with ä and ü
      expect(recipes[0].title).toBe('Käsespätzle');
      expect(recipes[0].ingredients[0].text).toBe('500g Mehl');
      expect(recipes[0].ingredients[1].text).toBe('250g Käse');
      expect(recipes[0].steps[0].text).toBe('Teig kneten und Spätzle formen');
      expect(recipes[0].steps[1].text).toBe('Mit Käse überbacken');
      
      // Check second recipe with Ä
      expect(recipes[1].title).toBe('Apfelstrudel');
      expect(recipes[1].ingredients[0].text).toBe('6 Äpfel');
      expect(recipes[1].steps[0].text).toBe('Äpfel schälen und würfeln');
      
      // Check third recipe with Ö
      expect(recipes[2].title).toBe('Öl-Brot');
      expect(recipes[2].ingredients[1].text).toBe('50ml Öl');
    });

    test('handles umlauts in author names and category fields', async () => {
      const csv = `Name;Erstellt von;Kulinarik;Speisenkategorie;Zutat1;Zubereitungsschritt1
Grünkohl;Müller;Traditionell,Würzig;Gemüse;500g Grünkohl;Kohl würzen`;

      const recipes = await parseBulkCSV(csv);

      expect(recipes).toHaveLength(1);
      expect(recipes[0].title).toBe('Grünkohl');
      expect(recipes[0].authorName).toBe('Müller');
      expect(recipes[0].kulinarik).toEqual(['Traditionell', 'Würzig']);
      expect(recipes[0].speisekategorie).toEqual(['Gemüse']);
      expect(recipes[0].ingredients[0].text).toBe('500g Grünkohl');
      expect(recipes[0].steps[0].text).toBe('Kohl würzen');
    });
  });
});
