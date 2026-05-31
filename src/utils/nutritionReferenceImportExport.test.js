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
        defaultAmountG: 100,
        kalorien: 18,
      },
    ]);

    expect(csv).toContain('ingredientID;nutritionFamily;seasonalFamily;category;Quelle;Suchbegriff;seasonRelevant;nutritionRelevant;isFresh;isSpice;isProcessed;synonyms;defaultAmountG;kalorien;protein;fett;kohlenhydrate;zucker;ballaststoffe;salz');
    expect(csv).toContain('dummy-tomate;Gemüse;Fruchtgemüse;Nachtschatten;manual;Tomate frisch;true;false;;;;Tomate|Paradeiser;100;18');
  });

  test('parses imported CSV rows and validates required fields', () => {
    const rows = parseNutritionReferenceCsv(
      [
        'ingredientID;nutritionFamily;seasonalFamily;category;Quelle;Suchbegriff;seasonRelevant;nutritionRelevant;isFresh;isSpice;isProcessed;synonyms;defaultAmountG;kalorien',
        'dummy-kartoffel;Gemüse;Knollen;Knolle;csv-import;kartoffel roh;ja;nein;true;false;0;Kartoffel|Erdapfel;150;86',
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
        defaultAmountG: 150,
        kalorien: '86',
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
