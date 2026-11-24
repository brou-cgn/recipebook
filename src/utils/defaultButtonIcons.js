// Standard-Symbole für die Button-Icons als Inline-SVG (data:-URI).
// Ersetzen die früheren Emoji-Defaults (AGENTS.md: keine Emojis im UI-Code).
// Die Werte laufen durch denselben Pfad wie hochgeladene Bilder (isBase64Image),
// brauchen also keine Anpassung an den Verbrauchern.

const LIGHT_COLOR = '#402C1C';
const DARK_COLOR = '#f2e8dc';
const HEART_RED = '#c0392b';
// Stopp-Knopf am Schritt-Timer: Rot wie bisher das Textsymbol (.step-timer-btn.stop), in beiden Themes
const TIMER_STOP_RED = '#cc4444';

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
  // Geschenk (Wichteln): Paket mit Schleife, gleiche Form wie components/icons/GiftIcon.js
  gift: {
    d: 'M4 11h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9zM3 7.5h18V11H3zM12 7.5V21M12 7.5c-1.2-2.6-4.6-3.6-5.4-1.6-.7 1.7 2.6 1.6 5.4 1.6zm0 0c1.2-2.6 4.6-3.6 5.4-1.6.7 1.7-2.6 1.6-5.4 1.6z',
  },
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
  // Ersatz für die früheren Text-Standards („Einkauf“, „Datum“, „Edit“, „Import“ …, Tech-Check P10)
  plus: { d: 'M12 5v14M5 12h14' },
  // Stern wie components/icons/StarIcon.js
  star: { d: 'M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z' },
  // Einkaufswagen wie components/icons/ShoppingCartIcon.js
  cart: { d: 'M2 3h2l2.4 12.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21 7H6M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z' },
  // Einkaufstasche (Einkaufsliste an Bring! übergeben)
  bag: { d: 'M5.5 8h13l-1 12.5h-11zM9 8V6.5a3 3 0 0 1 6 0V8' },
  printer: { d: 'M7 9V3h10v6M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v7H7z' },
  download: { d: 'M12 3v12M7 10l5 5 5-5M4 17v3h16v-3' },
  scan: { d: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10' },
  globe: { d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9M12 3c-2.5 2.5-3.8 5.5-3.8 9s1.3 6.5 3.8 9' },
  // Apfel (Nährwerte vorhanden)
  apple: {
    d: 'M12 7.5c-1.4-1.1-3.4-1.5-5-.7-2.4 1.2-3.2 4.4-2.2 7.6 1 3.2 3.2 5.6 5.1 5.6.8 0 1.3-.4 2.1-.4s1.3.4 2.1.4c1.9 0 4.1-2.4 5.1-5.6 1-3.2.2-6.4-2.2-7.6-1.6-.8-3.6-.4-5 .7zM12 7.5c0-2 .8-3.5 2.5-4.5',
  },
  refresh: { d: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5' },
  stop: { d: 'M7 7h10v10H7z', fill: true, color: TIMER_STOP_RED, darkColor: TIMER_STOP_RED },
  // Gefüllter Trichter: Filter aktiv (inaktiv: gear)
  filter: { d: 'M4 5h16l-6 7.5V19l-4 2v-8.5z', fill: true },
  // Zwei Blätter übereinander: eigene Version
  copy: { d: 'M9 9h11v11H9zM5 15H4V4h11v1' },
  list: { d: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01' },
  // Gestapelte Lagen: zurück zum Swipestapel
  layers: { d: 'M12 3l9 4.5-9 4.5-9-4.5zM3 12l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5' },
  // Gabel und Messer: zum Tagesmenü
  utensils: { d: 'M6 3v5.5a2.5 2.5 0 0 0 5 0V3M8.5 3v5M8.5 11v10M17 3c-1.7 1.6-2.5 4-2.5 7.5V13H17M17 3v18' },
  // Schloss mit Plus-Badge: privates Rezept anlegen (Badge wie bei Folgen)
  lockPlus: {
    d: 'M3 14a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 15 14v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 19.5zM5.5 12.5v-3a3.5 3.5 0 0 1 7 0v3',
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
  // width/height: Ohne sie rendern Browser (v. a. Safari) ein <img> ohne CSS-Größe
  // in 300 × 150 bzw. auf volle Breite — das Plus auf der Startseite wurde riesig.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ${paint} ` +
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
  privateButton: 'lock',
  addIngredient: 'carrot',
  addStep: 'note',
  resetThumbnail: 'camera',
  recipeSourceLink: 'link',
  recipeCardSwipeRight: 'clipboard',
  addImage: 'image',
  trendingTimeIcon: 'timer',
  eventsDrinksFab: 'cup',
  eventsGuestsFab: 'people',
  eventsWichtelFab: 'gift',
  wichtelTeilnehmerBearbeiten: 'pencil',
  saveRecipeIcon: 'save',
  followButton: 'follow',
  // Früher Text-Standards (Tech-Check P10). Bewusst weiter Text: closeButton(DefaultImg) „×“
  // (Farbe kommt über Fotos aus dem CSS), swipeRight/swipeLeft „✓“/„×“ (farbige Wisch-Hinweise),
  // tagesmenuKachelMenu(Alt) „⋯“ (Farbe hängt an der Helligkeit der Kachel).
  importRecipe: 'download',
  scanImage: 'scan',
  webImport: 'globe',
  filterButtonActive: 'filter',
  copyLink: 'link',
  nutritionFilled: 'apple',
  nutritionRecalc: 'refresh',
  shoppingList: 'cart',
  bringButton: 'bag',
  timerStop: 'stop',
  cookDate: 'calendar',
  addRecipe: 'plus',
  editRecipe: 'pencil',
  addPrivateRecipe: 'lockPlus',
  addRecipeToList: 'plus',
  saveRecipe: 'save',
  menuFavoritesButton: 'star',
  tagesmenuZumTagesMenu: 'utensils',
  tagesmenuMeineAuswahl: 'list',
  tagesmenuZurueckZumStapel: 'layers',
  newVersion: 'copy',
  // Versionsbutton (Rezept) und Speichern-Button des Formulars beim Bearbeiten mit KI:
  // Beschreibung offen bzw. Text erfasst. Hier eingetragen, damit es Dunkelvarianten gibt.
  newVersionDescribing: 'pencil',
  newVersionWithText: 'check',
  printRecipe: 'printer',
  addSection: 'plus',
  kuecheFab: 'plus',
};

/**
 * Standard-Symbol eines Button-Icon-Schlüssels, z. B. für den ersten Render, bevor die
 * gepflegten Icons geladen sind. Leer, wenn der Schlüssel kein Standard-Symbol hat.
 * @param {string} key Button-Icon-Schlüssel (z. B. 'shoppingList')
 * @param {boolean} [dark] Variante für den Dunkelmodus
 */
export function defaultButtonIcon(key, dark = false) {
  const name = DEFAULT_ICON_NAMES[key];
  return name ? defaultIcon(name, dark) : '';
}
