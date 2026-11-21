/**
 * Erzwingt die Regel "Keine Hex-Farben in Komponenten-CSS, nur Tokens aus
 * src/tokens.css" (AGENTS.md). Grund: darkMode.css ist eine Allowlist je
 * Klassenname; Komponenten mit festen Farben bleiben im Dark Mode hell,
 * sobald dort ein Eintrag fehlt. Tokens wechseln ihren Wert zentral.
 *
 * Bestehende Funde stehen als Baseline: je Datei die erlaubte Anzahl
 * Hex-Farben. Die Baseline darf nur sinken. Neue CSS-Dateien starten bei 0.
 * Ausgenommen: tokens.css (Definition) und darkMode.css (Altbestand, wird
 * abgebaut; dort gilt unten eine eigene Baseline für die Dark-Selektoren).
 */
const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const EXEMPT = ['tokens.css', 'darkMode.css'];

const BASELINE = {
  'App.css': 3,
  'components/AppCallsPage.css': 72,
  'components/AtelierCategorySelectionPage.css': 8,
  'components/AtelierOnboardingOverlay.css': 14,
  'components/AtelierSwipeTrainerOverlay.css': 58,
  'components/AtelierTasteIntroOverlay.css': 10,
  'components/BottomNavigation.css': 22,
  'components/ButtonIconsAdminTab.css': 195,
  'components/CookDateModal.css': 14,
  'components/DeleteRowButton.css': 4,
  'components/DiscoverTopicsTab.css': 17,
  'components/DrinkWeightsTab.css': 19,
  'components/EventplanungPage.css': 1,
  'components/EventsPage.css': 125,
  'components/EventsTable.css': 2,
  'components/FlowPage.css': 9,
  'components/FollowButton.css': 3,
  'components/FuerDichEntdecktKachel.css': 10,
  'components/GroupCreateDialog.css': 15,
  'components/GroupDetail.css': 39,
  'components/GroupList.css': 21,
  'components/Header.css': 61,
  'components/ImportProgressDialog.css': 16,
  'components/ImportProgressIndicator.css': 5,
  'components/KalibrierungsAuswertung.css': 4,
  'components/Kueche.css': 16,
  'components/Login.css': 52,
  'components/MeineKuechenstarsPage.css': 7,
  'components/MemberProfilePage.css': 3,
  'components/MenuDetail.css': 22,
  'components/MenuFilterSidebar.css': 12,
  'components/MenuForm.css': 55,
  'components/MenuList.css': 6,
  'components/MobileSearchOverlay.css': 21,
  'components/NetworkPage.css': 6,
  'components/NutritionModal.css': 72,
  'components/OcrScanModal.css': 109,
  'components/PasswordChangeModal.css': 9,
  'components/PersonalDataPage.css': 28,
  'components/PortionSelector.css': 8,
  'components/PrintFormatEditor.css': 43,
  'components/PrintPage.css': 16,
  'components/RatingModal.css': 15,
  'components/RecipeDetail.css': 106,
  'components/RecipeFilterSidebar.css': 18,
  'components/RecipeForm.css': 112,
  'components/RecipeImageCarousel.css': 4,
  'components/RecipeImportModal.css': 27,
  'components/RecipeList.css': 24,
  'components/RecipeRating.css': 7,
  'components/RecipeTimeline.css': 7,
  'components/RecipeTypeahead.css': 12,
  'components/Register.css': 14,
  'components/SavingOverlay.css': 1,
  'components/SeasonMatrixTab.css': 61,
  'components/Settings.css': 242,
  'components/SharePage.css': 9,
  'components/ShoppingListModal.css': 23,
  'components/SortCarousel.css': 1,
  'components/SplashScreen.css': 3,
  'components/Startseite.css': 28,
  'components/StartseitenKarussell.css': 4,
  'components/Tagesmenu.css': 38,
  'components/TemplateFormatEditor.css': 25,
  'components/TrendingCard.css': 11,
  'components/TutorialCard.css': 4,
  'components/TutorialForm.css': 4,
  'components/TutorialVideoModal.css': 10,
  'components/UniversalImportModal.css': 31,
  'components/UserManagement.css': 83,
  'components/WebImportModal.css': 28
};

function cssFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(full);
    return /\.css$/.test(entry.name) && !EXEMPT.includes(entry.name) ? [full] : [];
  });
}

describe('Farb-Token-Richtlinie', () => {
  const counts = {};
  cssFiles(SRC).forEach((file) => {
    const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const n = (css.match(HEX) || []).length;
    if (n > 0) counts[path.relative(SRC, file).split(path.sep).join('/')] = n;
  });

  it('führt keine neuen Hex-Farben ein und erhöht keine Baseline', () => {
    const violations = Object.entries(counts)
      .filter(([file, n]) => n > (BASELINE[file] || 0))
      .map(([file, n]) => `${file}: ${n} Hex-Farben (erlaubt: ${BASELINE[file] || 0}); Tokens aus src/tokens.css nutzen`);
    expect(violations).toEqual([]);
  });

  it('hält die Baseline aktuell (entfernte Farben senken den Wert)', () => {
    const stale = Object.entries(BASELINE)
      .filter(([file, n]) => (counts[file] || 0) < n)
      .map(([file, n]) => `${file}: Baseline ${n}, tatsächlich ${counts[file] || 0}`);
    expect(stale).toEqual([]);
  });

  it('definiert jedes genutzte --color-Token für Light und Dark', () => {
    const tokens = fs.readFileSync(path.join(SRC, 'tokens.css'), 'utf8');
    const [light, dark] = tokens.split(/\n\[data-theme="dark"\] \{/);
    const defined = (block) => new Set(block.match(/--color-[\w-]+(?=\s*:)/g) || []);
    const lightSet = defined(light);
    const darkSet = defined(dark);
    const used = new Set();
    cssFiles(SRC).forEach((file) => {
      (fs.readFileSync(file, 'utf8').match(/var\((--color-[\w-]+)/g) || []).forEach((m) =>
        used.add(m.slice(4))
      );
    });
    const missing = [...used].filter((name) => !lightSet.has(name) || !darkSet.has(name));
    expect(missing).toEqual([]);
  });
});

// darkMode.css ist Altbestand: neue Dark-Regeln gehören als Token in tokens.css
// (AGENTS.md). Gezählt werden die [data-theme="dark"]-Selektoren; der Wert darf nur
// sinken (Tech-Check D5: am 27.10.2026 kamen trotz Regel sieben neue dazu).
const DARK_MODE_SELECTORS = 990;

describe('darkMode.css (Altbestand)', () => {
  const css = fs.readFileSync(path.join(SRC, 'darkMode.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const count = (css.match(/\[data-theme="dark"\]/g) || []).length;

  it('bekommt keine neuen Dark-Selektoren', () => {
    const violations = count > DARK_MODE_SELECTORS
      ? [`darkMode.css: ${count} Dark-Selektoren (erlaubt: ${DARK_MODE_SELECTORS}); Farbe als Token in src/tokens.css anlegen`]
      : [];
    expect(violations).toEqual([]);
  });

  it('hält die Baseline aktuell (entfernte Regeln senken den Wert)', () => {
    const stale = count < DARK_MODE_SELECTORS
      ? [`darkMode.css: Baseline ${DARK_MODE_SELECTORS}, tatsächlich ${count}`]
      : [];
    expect(stale).toEqual([]);
  });
});
