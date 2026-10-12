/**
 * Erzwingt die Regel "Keine Emojis im UI-Code" (AGENTS.md, NO_EMOJIS_POLICY.md).
 *
 * Bestehende Funde stehen als Baseline unten: je Datei die erlaubte Anzahl.
 * Die Baseline darf nur sinken. Wer Emojis aus einer Datei entfernt, senkt
 * ihren Wert (oder streicht die Zeile). Neue Dateien dürfen keine enthalten.
 */
const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const EMOJI = /\p{Extended_Pictographic}/gu;

const BASELINE = {
  'components/AppCallsPage.js': 4,
  'components/ButtonIconsAdminTab.js': 4,
  'components/CookDateModal.js': 2,
  'components/DiscoverTopicsTab.js': 1,
  'components/DrinkManagementPage.js': 3,
  'components/EventDrinkSelectionPage.js': 2,
  'components/EventGuestSelectionPage.js': 2,
  'components/EventsPage.js': 2,
  'components/GroupDetail.js': 3,
  'components/GuestManagementPage.js': 2,
  'components/KalibrierungsAuswertung.js': 1,
  'components/MenuDetail.js': 8,
  'components/MenuFilterSidebar.js': 1,
  'components/MenuForm.js': 7,
  'components/MobileSearchOverlay.js': 1,
  'components/NutritionModal.js': 1,
  'components/NutritionReferenceTab.js': 2,
  'components/PrintFormatsSettings.js': 1,
  'components/RatingModal.js': 2,
  'components/RecipeCard.js': 2,
  'components/RecipeDetail.js': 33,
  'components/RecipeFilterSidebar.js': 1,
  'components/RecipeForm.js': 7,
  'components/RecipeRating.js': 2,
  'components/Settings.js': 5,
  'components/ShoppingListModal.js': 1,
  'components/TrendingCard.js': 1,
  'components/printEditor/ElementPropsPanel.js': 6,
  'components/templateEditor/FloatingToolbar.js': 1,
  'utils/customLists.js': 25,
  'utils/nutritionIconUtils.js': 1,
  'utils/printRecipe.js': 1,
};

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    const isSource = /\.jsx?$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name);
    return isSource ? [full] : [];
  });
}

describe('Emoji-Richtlinie', () => {
  const counts = {};
  sourceFiles(SRC).forEach((file) => {
    const n = (fs.readFileSync(file, 'utf8').match(EMOJI) || []).length;
    if (n > 0) counts[path.relative(SRC, file).split(path.sep).join('/')] = n;
  });

  it('führt keine neuen Emojis ein und erhöht keine Baseline', () => {
    const violations = Object.entries(counts)
      .filter(([file, n]) => n > (BASELINE[file] || 0))
      .map(([file, n]) => `${file}: ${n} Emojis (erlaubt: ${BASELINE[file] || 0})`);
    expect(violations).toEqual([]);
  });

  it('hält die Baseline aktuell (entfernte Emojis senken den Wert)', () => {
    const stale = Object.entries(BASELINE)
      .filter(([file, n]) => (counts[file] || 0) < n)
      .map(([file, n]) => `${file}: Baseline ${n}, tatsächlich ${counts[file] || 0}`);
    expect(stale).toEqual([]);
  });
});
