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
  'App.css': 5,
  'components/AppCallsPage.css': 91,
  'components/AtelierCategorySelectionPage.css': 10,
  'components/AtelierOnboardingOverlay.css': 14,
  'components/AtelierSwipeTrainerOverlay.css': 58,
  'components/AtelierTasteIntroOverlay.css': 10,
  'components/BottomNavigation.css': 23,
  'components/ButtonIconsAdminTab.css': 195,
  'components/CookDateModal.css': 26,
  'components/DeleteFabButton.css': 2,
  'components/DeleteRowButton.css': 4,
  'components/DiscoverTopicsTab.css': 17,
  'components/DrinkWeightsTab.css': 19,
  'components/EventplanungPage.css': 2,
  'components/EventsPage.css': 151,
  'components/EventsTable.css': 3,
  'components/FlowPage.css': 10,
  'components/FollowButton.css': 4,
  'components/FuerDichEntdecktKachel.css': 11,
  'components/GroupCreateDialog.css': 26,
  'components/GroupDetail.css': 49,
  'components/GroupList.css': 26,
  'components/GuestLinkConflictDialog.css': 2,
  'components/Header.css': 75,
  'components/ImportProgressDialog.css': 21,
  'components/ImportProgressIndicator.css': 7,
  'components/KalibrierungsAuswertung.css': 5,
  'components/Kueche.css': 20,
  'components/Login.css': 55,
  'components/MeineKuechenstarsPage.css': 9,
  'components/MemberProfilePage.css': 3,
  'components/MenuDetail.css': 31,
  'components/MenuFilterSidebar.css': 17,
  'components/MenuForm.css': 77,
  'components/MenuList.css': 13,
  'components/MobileSearchOverlay.css': 27,
  'components/NetworkPage.css': 6,
  'components/NutritionModal.css': 91,
  'components/OcrScanModal.css': 123,
  'components/PasswordChangeModal.css': 12,
  'components/PersonalDataPage.css': 38,
  'components/PortionSelector.css': 14,
  'components/PrintFormatEditor.css': 43,
  'components/PrintPage.css': 17,
  'components/RatingModal.css': 29,
  'components/RecipeDetail.css': 150,
  'components/RecipeFilterSidebar.css': 25,
  'components/RecipeForm.css': 149,
  'components/RecipeImageCarousel.css': 4,
  'components/RecipeImportModal.css': 33,
  'components/RecipeList.css': 39,
  'components/RecipeRating.css': 9,
  'components/RecipeTimeline.css': 15,
  'components/RecipeTypeahead.css': 13,
  'components/Register.css': 16,
  'components/SavingOverlay.css': 1,
  'components/SeasonMatrixTab.css': 61,
  'components/Settings.css': 280,
  'components/SharePage.css': 10,
  'components/ShoppingListModal.css': 35,
  'components/SortCarousel.css': 6,
  'components/SplashScreen.css': 5,
  'components/Startseite.css': 36,
  'components/StartseitenKarussell.css': 6,
  'components/Tagesmenu.css': 49,
  'components/TemplateFormatEditor.css': 25,
  'components/TrendingCard.css': 12,
  'components/TutorialCard.css': 5,
  'components/TutorialForm.css': 5,
  'components/TutorialVideoModal.css': 11,
  'components/UndoSnackbar.css': 4,
  'components/UniversalImportModal.css': 49,
  'components/UserManagement.css': 94,
  'components/WebImportModal.css': 34,
  'index.css': 1
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
const DARK_MODE_SELECTORS = 1015;

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
