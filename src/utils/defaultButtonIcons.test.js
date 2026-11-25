import { defaultIcon, defaultButtonIcon } from './defaultButtonIcons';
import { DEFAULT_BUTTON_ICONS, getEffectiveIcon } from './customLists';
import { mergeButtonIconRowDefs, getDefaultButtonIconGroups } from './buttonIconRows';

const decode = (uri) => decodeURIComponent(uri.replace('data:image/svg+xml;utf8,', ''));

describe('Folgen-Icon', () => {
  test('Person mit amberfarbenem Plus-Badge in beiden Themes', () => {
    const light = decode(defaultIcon('follow'));
    const dark = decode(defaultIcon('follow', true));
    expect(light).toContain('stroke="#402C1C"');
    expect(dark).toContain('stroke="#f2e8dc"');
    [light, dark].forEach((svg) => expect(svg).toContain('fill="#D4820A"'));
  });

  test('ist als einrichtbares Button-Icon mit Dunkelmodus-Variante hinterlegt', () => {
    expect(DEFAULT_BUTTON_ICONS.followButton).toBe(defaultIcon('follow'));
    expect(DEFAULT_BUTTON_ICONS.followButtonDark).toBe(defaultIcon('follow', true));
  });
});

describe('Icon „Rezept dazunehmen“ (Kochmodus, parallel kochen)', () => {
  test('Topf mit amberfarbenem Plus-Badge in beiden Themes', () => {
    const light = decode(defaultIcon('potPlus'));
    const dark = decode(defaultIcon('potPlus', true));
    expect(light).toContain('stroke="#402C1C"');
    expect(dark).toContain('stroke="#f2e8dc"');
    [light, dark].forEach((svg) => expect(svg).toContain('fill="#D4820A"'));
  });

  test('ist als eigenes einrichtbares Button-Icon mit Dunkelmodus-Variante hinterlegt', () => {
    expect(DEFAULT_BUTTON_ICONS.cookingAddRecipe).toBe(defaultIcon('potPlus'));
    expect(DEFAULT_BUTTON_ICONS.cookingAddRecipeDark).toBe(defaultIcon('potPlus', true));
  });

  test('steht in der Button-Icons-Verwaltung in der Gruppe Kochmodus', () => {
    const row = mergeButtonIconRowDefs().find((r) => r.key === 'cookingAddRecipe');
    expect(row).toMatchObject({ label: 'Kochmodus: Rezept dazunehmen', darkKey: 'cookingAddRecipeDark' });
    const group = getDefaultButtonIconGroups().groups.find((g) => g.id === 'g-kochmodus');
    expect(group.rowKeys.map((r) => r.key)).toContain('cookingAddRecipe');
  });
});

describe('Icon Wichteln-FAB (Events, Mobile)', () => {
  test('ist als einrichtbares Button-Icon mit Dunkelmodus-Variante hinterlegt', () => {
    expect(DEFAULT_BUTTON_ICONS.eventsWichtelFab).toBe(defaultIcon('gift'));
    expect(DEFAULT_BUTTON_ICONS.eventsWichtelFabDark).toBe(defaultIcon('gift', true));
  });

  test('steht in der Button-Icons-Verwaltung neben Getränke- und Gäste-FAB', () => {
    const row = mergeButtonIconRowDefs().find((r) => r.key === 'eventsWichtelFab');
    expect(row).toMatchObject({ label: 'Events: Wichteln-FAB (Mobile)', darkKey: 'eventsWichtelFabDark' });
    const group = getDefaultButtonIconGroups().groups.find((g) => g.id === 'g-kueche-events');
    expect(group.rowKeys.map((r) => r.key)).toEqual(
      expect.arrayContaining(['eventsDrinksFab', 'eventsGuestsFab', 'eventsWichtelFab'])
    );
  });
});

describe('Icon Wichteln: Teilnehmer bearbeiten', () => {
  test('ist als einrichtbares Button-Icon (Standard: Stift) mit Dunkelmodus-Variante hinterlegt', () => {
    expect(DEFAULT_BUTTON_ICONS.wichtelTeilnehmerBearbeiten).toBe(defaultIcon('pencil'));
    expect(DEFAULT_BUTTON_ICONS.wichtelTeilnehmerBearbeitenDark).toBe(defaultIcon('pencil', true));
  });

  test('steht in der Button-Icons-Verwaltung in der Gruppe Küche & Events', () => {
    const row = mergeButtonIconRowDefs().find((r) => r.key === 'wichtelTeilnehmerBearbeiten');
    expect(row).toMatchObject({ label: 'Wichteln: Teilnehmer bearbeiten', darkKey: 'wichtelTeilnehmerBearbeitenDark' });
    const group = getDefaultButtonIconGroups().groups.find((g) => g.id === 'g-kueche-events');
    expect(group.rowKeys.map((r) => r.key)).toContain('wichtelTeilnehmerBearbeiten');
  });
});

describe('Icons „Wein dazu“ (Weinbegleitung)', () => {
  test.each(['weinRot', 'weinWeiss', 'weinRose', 'weinSuess', 'weinKeinStil'])(
    '%s ist einrichtbar, mit Dunkelmodus-Variante; leer = eingebautes Glas',
    (key) => {
      expect(DEFAULT_BUTTON_ICONS[key]).toBe('');
      expect(DEFAULT_BUTTON_ICONS[`${key}Dark`]).toBe('');
      expect(mergeButtonIconRowDefs().find((r) => r.key === key)).toMatchObject({ darkKey: `${key}Dark` });
      const group = getDefaultButtonIconGroups().groups.find((g) => g.id === 'g-rezept-details');
      expect(group.rowKeys.map((r) => r.key)).toContain(key);
    }
  );

  test('das Icon für „Hier lieber Bier oder Wasser“ heißt in der Verwaltung so', () => {
    expect(mergeButtonIconRowDefs().find((r) => r.key === 'weinKeinStil').label)
      .toBe('Wein dazu: Bier oder Wasser (leer = Glas)');
  });

  test('das Icon für Süßweine heißt in der Verwaltung so und steht nach Rosé und vor Bier oder Wasser', () => {
    expect(mergeButtonIconRowDefs().find((r) => r.key === 'weinSuess').label)
      .toBe('Wein dazu: Süßwein (leer = Glas)');
    const keys = getDefaultButtonIconGroups().groups.find((g) => g.id === 'g-rezept-details').rowKeys.map((r) => r.key);
    expect(keys.slice(keys.indexOf('weinRot'), keys.indexOf('weinKeinStil') + 1))
      .toEqual(['weinRot', 'weinWeiss', 'weinRose', 'weinSuess', 'weinKeinStil']);
  });
});

describe('Standard-Symbole statt Text (Tech-Check P10)', () => {
  // Text bleibt nur, wo die Farbe vom Hintergrund abhängt: Schließen über Fotos, farbige
  // Wisch-Hinweise im Tagesmenü, Kachel-Menü je nach Helligkeit der Kachel
  const TEXT_ERLAUBT = {
    closeButton: '×',
    closeButtonDefaultImg: '×',
    swipeRight: '✓',
    swipeLeft: '×',
    tagesmenuKachelMenu: '⋯',
    tagesmenuKachelMenuAlt: '⋯',
  };

  test('kein Button-Icon hat mehr Text als Standard, außer den begründeten Zeichen', () => {
    const mitText = Object.entries(DEFAULT_BUTTON_ICONS)
      .filter(([key, value]) => value && !value.startsWith('data:image/') && TEXT_ERLAUBT[key] !== value)
      .map(([key, value]) => `${key}: ${value}`);
    expect(mitText).toEqual([]);
  });

  test.each([
    ['shoppingList', 'cart'],
    ['cookDate', 'calendar'],
    ['editRecipe', 'pencil'],
    ['saveRecipe', 'save'],
    ['addPrivateRecipe', 'lockPlus'],
    ['printRecipe', 'printer'],
  ])('%s zeigt als Standard das Symbol %s, im Dunkelmodus hell eingefärbt', (key, shape) => {
    expect(DEFAULT_BUTTON_ICONS[key]).toBe(defaultIcon(shape));
    expect(DEFAULT_BUTTON_ICONS[`${key}Dark`]).toBe(defaultIcon(shape, true));
    expect(defaultButtonIcon(key)).toBe(defaultIcon(shape));
    expect(defaultButtonIcon(key, true)).toBe(defaultIcon(shape, true));
  });

  test('der Stopp-Knopf am Timer bleibt in beiden Themes rot', () => {
    [defaultButtonIcon('timerStop'), defaultButtonIcon('timerStop', true)].forEach((uri) => {
      expect(decode(uri)).toContain('fill="#cc4444"');
    });
  });

  test('defaultButtonIcon liefert für Schlüssel ohne Standard-Symbol einen leeren Wert', () => {
    expect(defaultButtonIcon('closeButton')).toBe('');
    expect(defaultButtonIcon('gibtEsNicht')).toBe('');
  });
});

describe('getEffectiveIcon: gepflegte Icons vor Standard-Symbolen', () => {
  const eigenesIcon = 'data:image/png;base64,AAAA';

  test('ohne gepflegtes Icon gilt im Dunkelmodus das helle Standard-Dunkelsymbol', () => {
    expect(getEffectiveIcon(DEFAULT_BUTTON_ICONS, 'shoppingList', true)).toBe(defaultIcon('cart', true));
    expect(getEffectiveIcon(DEFAULT_BUTTON_ICONS, 'shoppingList', false)).toBe(defaultIcon('cart'));
  });

  test('ein nur hell gepflegtes Icon erscheint auch im Dunkelmodus, nicht das Standard-Symbol', () => {
    const icons = { ...DEFAULT_BUTTON_ICONS, shoppingList: eigenesIcon };
    expect(getEffectiveIcon(icons, 'shoppingList', true)).toBe(eigenesIcon);
  });

  test('ein gepflegtes Dunkel-Icon hat im Dunkelmodus Vorrang', () => {
    const eigenesDunkel = 'data:image/png;base64,BBBB';
    const icons = { ...DEFAULT_BUTTON_ICONS, shoppingList: eigenesIcon, shoppingListDark: eigenesDunkel };
    expect(getEffectiveIcon(icons, 'shoppingList', true)).toBe(eigenesDunkel);
  });
});

describe('Eigengröße der Standard-Symbole', () => {
  // Ohne width/height rendert Safari ein <img> ohne CSS-Größe in 300 × 150 —
  // so wurde das Plus neben „Meine Kochideen“ bildschirmhoch.
  test('jedes Standard-SVG trägt 24 × 24 als Eigengröße', () => {
    Object.values(DEFAULT_BUTTON_ICONS)
      .filter((v) => typeof v === 'string' && v.startsWith('data:image/svg+xml'))
      .forEach((uri) => {
        const svg = decode(uri);
        expect(svg).toContain('width="24"');
        expect(svg).toContain('height="24"');
      });
  });
});
