// Standard-Symbole für die Button-Icons als Inline-SVG (data:-URI).
// Ersetzen die früheren Emoji-Defaults (AGENTS.md: keine Emojis im UI-Code).
// Die Werte laufen durch denselben Pfad wie hochgeladene Bilder (isBase64Image),
// brauchen also keine Anpassung an den Verbrauchern.

const LIGHT_COLOR = '#402C1C';
const DARK_COLOR = '#f2e8dc';
const HEART_RED = '#c0392b';

const SHAPES = {
  steam: { d: 'M7 4c-1.5 2 1.5 3 0 5s1.5 3 0 5M12 4c-1.5 2 1.5 3 0 5s1.5 3 0 5M17 4c-1.5 2 1.5 3 0 5s1.5 3 0 5M5 19h14' },
  gear: {
    d: 'M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  },
  heart: { d: 'M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.5 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z', color: HEART_RED, darkColor: HEART_RED },
  heartFilled: {
    d: 'M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.5 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z',
    fill: true,
    color: HEART_RED,
    darkColor: HEART_RED,
  },
  pencil: { d: 'M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z' },
  play: { d: 'M8 5l11 7-11 7z', fill: true },
  userPlus: { d: 'M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c0-3.3 3.1-6 7-6s7 2.7 7 6M19 8v6M16 11h6' },
  lock: { d: 'M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM8 11V7a4 4 0 0 1 8 0v4' },
  carrot: { d: 'M14.5 6.5l3 3-9.5 10.5a1.2 1.2 0 0 1-1.7 0l-1.1-1.1a1.2 1.2 0 0 1 0-1.7zM15.5 5.5l2-2.5M17.5 7.5l2.5-2M13.5 4l.5-2' },
  note: { d: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h7' },
  camera: { d: 'M4 8h3l1.5-2h7L17 8h3v11H4zM12 16.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' },
  link: { d: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1' },
  check: { d: 'M5 12.5l4.5 4.5L19 7.5' },
  clipboard: { d: 'M9 4h6v3H9zM7 5H5v16h14V5h-2M9 12h6M9 16h6' },
  image: { d: 'M4 5h16v14H4zM9 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM4 17l5-5 4 4 3-3 4 4' },
  timer: { d: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 13V9M9 2h6' },
  cup: { d: 'M6 3h12l-1.2 15.2A2 2 0 0 1 14.8 20H9.2a2 2 0 0 1-2-1.8zM7 9h10' },
  people: { d: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.3 2.9-6 6.5-6s6.5 2.7 6.5 6M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.5c2 .7 3.5 2.6 3.5 5.5' },
  calendar: { d: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4' },
  save: { d: 'M5 3h11l3 3v15H5zM8 3v6h7V3M8 21v-7h8v7' },
  // Person mit Plus-Badge (Folgen). Das Badge ist in beiden Themes Bernstein.
  follow: {
    d: 'M9 11a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6zM2.5 21c.6-3.8 3.3-6 6.5-6 1.2 0 2.3.3 3.2.8',
    badge: { cx: 18, cy: 18, r: 5.5, plus: 'M18 15.4v5.2M15.4 18h5.2' },
  },
  // Dampfender Topf mit Plus-Badge (Kochmodus: weiteres Rezept dazunehmen), Badge wie bei Folgen
  potPlus: {
    d: 'M4 12.5h12v4.5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3zM1.8 14h2.2M16 14h2.2M7 9.5c-1-1.2 1-2.3 0-4.5M10.5 9.5c-1-1.2 1-2.3 0-4.5',
    badge: { cx: 18, cy: 6, r: 5.5, plus: 'M18 3.4v5.2M15.4 6h5.2' },
  },
};

const BADGE_FILL = '#D4820A';
const BADGE_PLUS = '#1A1A18';

/**
 * Liefert ein Standard-Symbol als data:-URI.
 * @param {keyof typeof SHAPES} name
 * @param {boolean} [dark] Variante für den Dunkelmodus
 */
export function defaultIcon(name, dark = false) {
  const shape = SHAPES[name];
  const color = dark ? shape.darkColor || DARK_COLOR : shape.color || LIGHT_COLOR;
  const paint = shape.fill ? `fill="${color}" stroke="${color}"` : `fill="none" stroke="${color}"`;
  const badge = shape.badge
    ? `<circle cx="${shape.badge.cx}" cy="${shape.badge.cy}" r="${shape.badge.r}" fill="${BADGE_FILL}" stroke="none"/>` +
      `<path d="${shape.badge.plus}" fill="none" stroke="${BADGE_PLUS}" stroke-width="1.8"/>`
    : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ${paint} ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${shape.d}"/>${badge}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Button-Icon-Schlüssel → Symbol. Für diese Schlüssel werden auch die
// Dunkelmodus-Defaults (`<key>Dark`) gesetzt.
export const DEFAULT_ICON_NAMES = {
  cookingMode: 'steam',
  cookingModeDefaultImg: 'steam',
  cookingAddRecipe: 'potPlus',
  filterButton: 'gear',
  ratingHeartEmpty: 'heart',
  ratingHeartEmptyModal: 'heart',
  ratingHeartFilled: 'heartFilled',
  listSettings: 'gear',
  listSettingsActive: 'pencil',
  timerStart: 'play',
  addGroupMember: 'userPlus',
  privateBadge: 'lock',
  addIngredient: 'carrot',
  addStep: 'note',
  resetThumbnail: 'camera',
  recipeSourceLink: 'link',
  recipeCardSwipeRight: 'clipboard',
  addImage: 'image',
  trendingTimeIcon: 'timer',
  eventsDrinksFab: 'cup',
  eventsGuestsFab: 'people',
  saveRecipeIcon: 'save',
  followButton: 'follow',
};
