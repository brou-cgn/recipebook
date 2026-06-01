import { createNutritionReferenceCsv, parseNutritionReferenceCsv } from './nutritionReferenceImportExport';

describe('nutritionReferenceImportExport', () => {
  test('exports rows as semicolon CSV with synonym list', () => {
    const csv = createNutritionReferenceCsv([
      {
        ingredientID: 'dummy-tomate',
        nutritionFamily: 'Gemüse',
        seasonalFamily: 'Fruchtgemüse',
        category: 'Nachtschatten',
        source: 'manual',
        searchTerm: 'Tomate frisch',
        seasonRelevant: true,
        nutritionRelevant: false,
        synonyms: ['Tomate', 'Paradeiser'],
        possibleUnits: ['g', 'kg', 'ml'],
        defaultAmountG: 100,
        kalorien: 18,
      },
    ]);

    expect(csv).toContain('ingredientID;nutritionFamily;seasonalFamily;category;Quelle;Suchbegriff;seasonRelevant;nutritionRelevant;isFresh;isSpice;isProcessed;synonyms;possibleUnits;defaultAmountG;kalorien;protein;fett;kohlenhydrate;zucker;ballaststoffe;salz');
    expect(csv).toContain('dummy-tomate;Gemüse;Fruchtgemüse;Nachtschatten;manual;Tomate frisch;true;false;;;;Tomate|Paradeiser;g|kg|ml;100;18');
  });

  test('exports rows with empty possibleUnits', () => {
    const csv = createNutritionReferenceCsv([
      {
        ingredientID: 'dummy-tomate',
        synonyms: ['Tomate'],
      },
    ]);

    expect(csv).toContain('dummy-tomate;;;;;;;;;;;Tomate;');
    expect(csv).not.toContain('g|kg|ml');
  });

  test('parses imported CSV rows and validates required fields', () => {
    const rows = parseNutritionReferenceCsv(
      [
        'ingredientID;nutritionFamily;seasonalFamily;category;Quelle;Suchbegriff;seasonRelevant;nutritionRelevant;isFresh;isSpice;isProcessed;synonyms;possibleUnits;defaultAmountG;kalorien',
        'dummy-kartoffel;Gemüse;Knollen;Knolle;csv-import;kartoffel roh;ja;nein;true;false;0;Kartoffel|Erdapfel;g|kg;150;86',
      ].join('\n')
    );

    expect(rows).toEqual([
      expect.objectContaining({
        ingredientID: 'dummy-kartoffel',
        nutritionFamily: 'Gemüse',
        seasonalFamily: 'Knollen',
        category: 'Knolle',
        source: 'csv-import',
        searchTerm: 'kartoffel roh',
        seasonRelevant: true,
        nutritionRelevant: false,
        isFresh: true,
        isSpice: false,
        isProcessed: false,
        synonyms: ['Kartoffel', 'Erdapfel'],
        possibleUnits: ['g', 'kg'],
        defaultAmountG: 150,
        kalorien: '86',
      }),
    ]);
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

  test('accepts legacy family/source/searchTerm headers for compatibility', () => {
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
        source: 'legacy',
        searchTerm: 'Apfel rot',
      }),
    ]);
  });
});
