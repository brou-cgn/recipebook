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
