import { createNutritionReferenceCsv, parseNutritionReferenceCsv } from './nutritionReferenceImportExport';

describe('nutritionReferenceImportExport', () => {
  test('exports rows as semicolon CSV with synonym list', () => {
    const csv = createNutritionReferenceCsv([
      {
        ingredientID: 'dummy-tomate',
        nutritionFamily: 'Gemüse',
        seasonalFamily: 'Fruchtgemüse',
        category: 'Nachtschatten',
        seasonRelevant: true,
        nutritionRelevant: false,
        synonyms: ['Tomate', 'Paradeiser'],
        possibleUnits: ['g', 'kg', 'ml'],
        defaultAmountG: 100,
      },
    ]);

    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    expect(csv).toContain('ingredientID;Anzeigename;nutritionFamily;seasonalFamily;category;seasonRelevant;nutritionRelevant;isFresh;isSpice;isProcessed;synonyms;possibleUnits;defaultAmountG');
    expect(csv).toContain('dummy-tomate;;Gemüse;Fruchtgemüse;Nachtschatten;true;false;;;;Tomate|Paradeiser;"g;kg;ml";100');
  });

  test('exports rows with empty possibleUnits', () => {
    const csv = createNutritionReferenceCsv([
      {
        ingredientID: 'dummy-tomate',
        synonyms: ['Tomate'],
      },
    ]);

    expect(csv).toContain('dummy-tomate;;;;;;;;;;Tomate;;');
    expect(csv).not.toContain('g;kg;ml');
  });

  test('parses imported CSV rows and validates required fields', () => {
    const rows = parseNutritionReferenceCsv(
      [
        'ingredientID;Anzeigename;nutritionFamily;seasonalFamily;category;Quelle;Suchbegriff;seasonRelevant;nutritionRelevant;isFresh;isSpice;isProcessed;synonyms;possibleUnits;defaultAmountG;kalorien',
        'dummy-kartoffel;Kartoffel;Gemüse;Knollen;Knolle;csv-import;kartoffel roh;ja;nein;true;false;0;Kartoffel|Erdapfel;"g;kg";150;86',
      ].join('\n')
    );

    expect(rows).toEqual([
      expect.objectContaining({
        ingredientID: 'dummy-kartoffel',
        displayName: 'Kartoffel',
        nutritionFamily: 'Gemüse',
        seasonalFamily: 'Knollen',
        category: 'Knolle',
        seasonRelevant: true,
        nutritionRelevant: false,
        isFresh: true,
        isSpice: false,
        isProcessed: false,
        synonyms: ['Kartoffel', 'Erdapfel'],
        possibleUnits: ['g', 'kg'],
        defaultAmountG: 150,
      }),
    ]);
    expect(rows[0]).not.toHaveProperty('source');
    expect(rows[0]).not.toHaveProperty('searchTerm');
    expect(rows[0]).not.toHaveProperty('kalorien');
  });

  test('parses imported CSV rows without possibleUnits column (backward compatibility)', () => {
    const rows = parseNutritionReferenceCsv(
      [
        'ingredientID;nutritionFamily;seasonalFamily;category;Quelle;Suchbegriff;seasonRelevant;nutritionRelevant;isFresh;isSpice;isProcessed;synonyms;defaultAmountG;kalorien',
        'dummy-kartoffel;Gemüse;Knollen;Knolle;csv-import;kartoffel roh;ja;nein;true;false;0;Kartoffel|Erdapfel;150;86',
      ].join('\n')
    );

    expect(rows).toEqual([
      expect.objectContaining({
        ingredientID: 'dummy-kartoffel',
        synonyms: ['Kartoffel', 'Erdapfel'],
        possibleUnits: [],
        defaultAmountG: 150,
      }),
    ]);
  });

  test('throws on duplicate ingredient ids', () => {
    expect(() => parseNutritionReferenceCsv(
      [
        'ingredientID;synonyms',
        'dummy-a;A',
        'dummy-a;B',
      ].join('\n')
    )).toThrow('Doppelte ingredientID gefunden');
  });

  test('accepts legacy family/source/searchTerm headers while ignoring source/searchTerm', () => {
    const rows = parseNutritionReferenceCsv(
      [
        'ingredientID;family;category;source;searchTerm;synonyms',
        'dummy-apfel;Obst;Kernobst;legacy;Apfel rot;Apfel',
      ].join('\n')
    );

    expect(rows).toEqual([
      expect.objectContaining({
        ingredientID: 'dummy-apfel',
        nutritionFamily: 'Obst',
      }),
    ]);
    expect(rows[0]).not.toHaveProperty('source');
    expect(rows[0]).not.toHaveProperty('searchTerm');
  });

  test('parses legacy displayName header', () => {
    const rows = parseNutritionReferenceCsv(
      [
        'ingredientID;displayName;synonyms',
        'dummy-apfel;Apfel rot;Apfel',
      ].join('\n')
    );

    expect(rows).toEqual([
      expect.objectContaining({
        ingredientID: 'dummy-apfel',
        displayName: 'Apfel rot',
      }),
    ]);
  });

  test('parses UTF-8 BOM CSV with umlauts', () => {
    const rows = parseNutritionReferenceCsv(
      [
        '\uFEFFingredientID;nutritionFamily;seasonalFamily;category;Quelle;Suchbegriff;synonyms',
        'dummy-aepfel;Obst;Kernobst;Frucht;csv-import;Äpfel in Öl süß;Äpfel|Öl|süß',
      ].join('\n')
    );

    expect(rows).toEqual([
      expect.objectContaining({
        ingredientID: 'dummy-aepfel',
        nutritionFamily: 'Obst',
        synonyms: ['Äpfel', 'Öl', 'süß'],
      }),
    ]);
  });
});
