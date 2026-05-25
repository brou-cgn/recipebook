import { createSeasonMatrixTemplateCsv, parseSeasonMatrixImport } from './seasonMatrixImportExport';

describe('seasonMatrixImportExport', () => {
  it('creates a CSV template with required headers', () => {
    const template = createSeasonMatrixTemplateCsv();

    expect(template).toContain('id;name;category;mainSeasonMonths;secondarySeasonMonths;seasonScore;labelMode;isActive;region;synonyms;description');
    expect(template).toContain('kartoffel;Kartoffel;Gemuese;1|2|3|9|10|11');
  });

  it('parses valid CSV content and normalizes fields', () => {
    const csv = [
      'id;name;category;mainSeasonMonths;secondarySeasonMonths;seasonScore;labelMode;isActive;region;synonyms;description',
      'spargel;Spargel;Gemuese;4|5|6;3|7;92;jetzt_saison;ja;DE;Asparagus|Fruehlingsspross;Frischer Spargel'
    ].join('\n');

    const result = parseSeasonMatrixImport(csv, {
      fileName: 'import.csv',
      regionOptions: ['GLOBAL', 'DE'],
      labelModeOptions: ['jetzt_saison', 'bald_saison', 'ausserhalb']
    });

    expect(result.errors).toEqual([]);
    expect(result.entries).toEqual([
      {
        id: 'spargel',
        name: 'Spargel',
        category: 'Gemuese',
        mainSeasonMonths: [4, 5, 6],
        secondarySeasonMonths: [3, 7],
        seasonScore: 92,
        labelMode: 'jetzt_saison',
        isActive: true,
        region: 'DE',
        synonyms: ['Asparagus', 'Fruehlingsspross'],
        description: 'Frischer Spargel'
      }
    ]);
  });

  it('returns row errors while keeping valid rows', () => {
    const csv = [
      'id;name;mainSeasonMonths;seasonScore;labelMode;region',
      'kirsche;Kirsche;6|7;88;jetzt_saison;DE',
      'mango;Mango;13;85;jetzt_saison;DE'
    ].join('\n');

    const result = parseSeasonMatrixImport(csv, {
      fileName: 'import.csv',
      regionOptions: ['DE'],
      labelModeOptions: ['jetzt_saison']
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].id).toBe('kirsche');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('ungültigen Monat');
  });

  it('parses JSON content', () => {
    const json = JSON.stringify([
      {
        id: 'apfel',
        name: 'Apfel',
        mainSeasonMonths: [9, 10],
        secondarySeasonMonths: [8, 11],
        seasonScore: 70,
        labelMode: 'bald_saison',
        region: 'GLOBAL',
        isActive: false,
        synonyms: ['Apple']
      }
    ]);

    const result = parseSeasonMatrixImport(json, {
      fileName: 'import.json'
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      id: 'apfel',
      isActive: false,
      labelMode: 'bald_saison',
      region: 'GLOBAL'
    });
  });

  it('throws when no valid entries are present', () => {
    const csv = [
      'id;name;mainSeasonMonths;seasonScore;labelMode;region',
      'tomate;Tomate;0;110;jetzt_saison;DE'
    ].join('\n');

    expect(() => parseSeasonMatrixImport(csv, {
      fileName: 'import.csv',
      regionOptions: ['DE'],
      labelModeOptions: ['jetzt_saison']
    })).toThrow('Import fehlgeschlagen');
  });
});
