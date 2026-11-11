import { defaultIcon } from './defaultButtonIcons';
import { DEFAULT_BUTTON_ICONS } from './customLists';
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
