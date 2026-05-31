import { createNutritionReferenceCsv, parseNutritionReferenceCsv } from './nutritionReferenceImportExport';

describe('nutritionReferenceImportExport', () => {
  test('exports rows as semicolon CSV with synonym list', () => {
    const csv = createNutritionReferenceCsv([
      {
        ingredientID: 'dummy-tomate',
        family: 'Gemüse',
        category: 'Nachtschatten',
        seasonRelevant: true,
        nutritionRelevant: false,
        synonyms: ['Tomate', 'Paradeiser'],
        defaultAmountG: 100,
        kalorien: 18,
      },
    ]);

    expect(csv).toContain('ingredientID;family;category;seasonRelevant;nutritionRelevant;isFresh;isSpice;isProcessed;synonyms;defaultAmountG;kalorien;protein;fett;kohlenhydrate;zucker;ballaststoffe;salz');
    expect(csv).toContain('dummy-tomate;Gemüse;Nachtschatten;true;false;;;;Tomate|Paradeiser;100;18');
  });

  test('parses imported CSV rows and validates required fields', () => {
    const rows = parseNutritionReferenceCsv(
      [
        'ingredientID;family;category;seasonRelevant;nutritionRelevant;isFresh;isSpice;isProcessed;synonyms;defaultAmountG;kalorien',
        'dummy-kartoffel;Gemüse;Knolle;ja;nein;true;false;0;Kartoffel|Erdapfel;150;86',
      ].join('\n')
    );

    expect(rows).toEqual([
      expect.objectContaining({
        ingredientID: 'dummy-kartoffel',
        family: 'Gemüse',
        category: 'Knolle',
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
});
