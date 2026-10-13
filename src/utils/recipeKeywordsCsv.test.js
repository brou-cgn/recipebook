import {
  buildRecipesKeywordCsv,
  escapeCsvCell,
  suggestKeywords,
  KEYWORD_AXES,
} from './recipeKeywordsCsv';

const carbonara = {
  id: 'r1',
  title: 'Spaghetti Carbonara',
  kulinarik: ['Italienische Küche'],
  speisekategorie: ['Hauptspeisen'],
  kochdauer: 25,
  schwierigkeit: 2,
  ingredients: ['400 g Spaghetti', '200 g Speck', '4 Eier', { type: 'heading', text: 'Sauce' }],
  steps: ['Nudeln kochen', 'Sauce zubereiten'],
};

describe('suggestKeywords', () => {
  it('leitet Aufwand, Anlass und Hauptzutat ab', () => {
    const k = suggestKeywords(carbonara);
    expect(k.aufwand).toContain('Unter 30 Min');
    expect(k.anlass).toContain('Schnell unter der Woche');
    expect(k.hauptzutat).toEqual(expect.arrayContaining(['Pasta', 'Fleisch']));
    expect(k.hauptzutat.length).toBeLessThanOrEqual(2);
  });

  it('ignoriert Brühe-Zeilen bei der Hauptzutat', () => {
    const k = suggestKeywords({
      title: 'Gemüsesuppe',
      ingredients: ['1 l Hühnerbrühe', '2 Karotten', '1 Zucchini', '1 Lauch'],
    });
    expect(k.hauptzutat).not.toContain('Geflügel');
    expect(k.hauptzutat).toContain('Gemüse');
  });

  it('nutzt Weihnachtliche Küche für die Saison', () => {
    expect(suggestKeywords({ title: 'Plätzchen', kulinarik: ['Weihnachtliche Küche'] }).saison)
      .toContain('Weihnachten');
  });

  it('schlägt für Getränke keine Hauptzutat vor', () => {
    expect(suggestKeywords({ title: 'Hühnchen-Shot', speisekategorie: ['Drinks'] }).hauptzutat).toEqual([]);
  });

  it('liefert nur Werte aus dem Vokabular', () => {
    const k = suggestKeywords({ ...carbonara, kochdauer: 150, schwierigkeit: 5 });
    for (const axis of KEYWORD_AXES) {
      for (const value of k[axis.key]) expect(axis.values).toContain(value);
    }
  });

  it('kommt mit leerem Rezept zurecht', () => {
    expect(() => suggestKeywords({})).not.toThrow();
  });
});

describe('escapeCsvCell', () => {
  it('maskiert Semikolon, Anführungszeichen und Zeilenumbrüche', () => {
    expect(escapeCsvCell('a;b')).toBe('"a;b"');
    expect(escapeCsvCell('sag "hi"')).toBe('"sag ""hi"""');
    expect(escapeCsvCell('a\nb')).toBe('"a\nb"');
  });

  it('entschärft Excel-Formeln', () => {
    expect(escapeCsvCell('=SUMME(A1)')).toBe("'=SUMME(A1)");
    expect(escapeCsvCell('@cmd')).toBe("'@cmd");
  });
});

describe('buildRecipesKeywordCsv', () => {
  it('beginnt mit BOM, nutzt Semikolon und CRLF und enthält die ID', () => {
    const csv = buildRecipesKeywordCsv([carbonara]);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    const [header, row] = csv.slice(1).split('\r\n');
    expect(header.split(';').slice(0, 2)).toEqual(['ID', 'Name']);
    expect(header).toContain('Anlass;Saison;Aufwand;Ernährung;Hauptzutat');
    expect(row.startsWith('r1;Spaghetti Carbonara;')).toBe(true);
  });

  it('sortiert nach Titel und exportiert leere Liste nur mit Kopfzeile', () => {
    const csv = buildRecipesKeywordCsv([{ id: 'b', title: 'Zebra' }, { id: 'a', title: 'Apfel' }]);
    const lines = csv.trim().split('\r\n');
    expect(lines[1].startsWith('a;Apfel')).toBe(true);
    expect(buildRecipesKeywordCsv([]).trim().split('\r\n')).toHaveLength(1);
  });
});
