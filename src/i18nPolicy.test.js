/**
 * Mehrsprachigkeit (docs/vorhaben/mehrsprachigkeit.md): Sichtbare Texte kommen aus den
 * Wörterbüchern in src/i18n/texte/ (useTexte, Anleitung in src/i18n/texte.js), nicht fest
 * eingetippt im JSX. Die Oberfläche wird Bereich für Bereich umgestellt; bis dahin zählt
 * dieser Test je Datei die fest eingetippten Texte. Bestand als Baseline, darf nur sinken;
 * neue Dateien starten bei 0. Die Summe der Baseline ist das, was noch zu übersetzen ist.
 *
 * Gezählt wird, was nach Text für Menschen aussieht (mindestens zwei Buchstaben am Stück):
 *  - Textknoten im JSX,
 *  - feste Zeichenketten und Template-Texte als JSX-Kind ({'…'}, {a ? '…' : '…'}, {`…`}),
 *  - die Attribute aria-label, title, placeholder, alt und label mit festem Text.
 * Nicht gezählt: Texte, die in Hilfsfunktionen oder Konstanten entstehen (etwa Fehlermeldungen
 * in utils/ oder Tab-Namen in Listen). Die stellt der jeweilige Bereichs-PR mit um.
 *
 * Der Admin-Bereich bleibt deutsch (Entscheidung im Tracker). Seine Dateien stehen in
 * NUR_DEUTSCH und werden nicht gezählt; neue Einträge nur mit Begründung.
 */
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');

const SRC = __dirname;
const BUCHSTABEN = /[A-Za-zÄÖÜäöüßÀ-ÿ]{2,}/;
const TEXT_ATTRIBUTE = new Set(['aria-label', 'title', 'placeholder', 'alt', 'label']);

// „Verwaltung“ im Header-Menü: nur für admin oder mit settingsAccess (Header.js). Dazu die
// Tabs, die Settings.js einbindet, und die App-Aufrufe aus demselben Menüabschnitt.
const NUR_DEUTSCH = new Set([
  'components/AppCallsPage.js',
  'components/ButtonIconsAdminTab.js',
  'components/DiscoverTopicsTab.js',
  'components/DrinkWeightsTab.js',
  'components/NutritionReferenceTab.js',
  'components/PrintFormatsSettings.js',
  'components/SeasonMatrixTab.js',
  'components/Settings.js',
  // Einstellungen › KI: Backfill der Titelübersetzungen (Mehrsprachigkeit PR 3)
  'components/TitelUebersetzungBackfill.js',
  'components/UserManagement.js',
]);

// Stand 22.11.2026 (PR 2): 1740 Textstellen in 97 Dateien.
const BASELINE = {
  'App.js': 5,
  'components/AtelierCategorySelectionPage.js': 5,
  'components/AtelierOnboardingOverlay.js': 9,
  'components/AtelierSwipeTrainerOverlay.js': 8,
  'components/AtelierTasteIntroOverlay.js': 8,
  'components/BottomNavigation.js': 2,
  'components/CallLogPanel.js': 35,
  'components/ConfirmDialog.js': 1,
  'components/ConsumptionForm.js': 33,
  'components/CookDateModal.js': 14,
  'components/CookingAddRecipeButton.js': 2,
  'components/CookingAddRecipeSheet.js': 15,
  'components/CookingAlarmModal.js': 2,
  'components/CookingModeTitleBar.js': 5,
  'components/CookingSessionCarousel.js': 9,
  'components/CookingSessionDock.js': 3,
  'components/CookingSessionRail.js': 5,
  'components/DrinkManagementPage.js': 60,
  'components/EventDrinkSelectionPage.js': 26,
  'components/EventForm.js': 36,
  'components/EventGuestSelectionPage.js': 20,
  'components/EventplanungPage.js': 5,
  'components/EventsPage.js': 48,
  'components/FlowPage.js': 3,
  'components/FollowName.js': 1,
  'components/FuerDichEntdecktKachel.js': 2,
  'components/GroupCreateDialog.js': 23,
  'components/GroupDetail.js': 55,
  'components/GroupEditDialog.js': 21,
  'components/GroupList.js': 15,
  'components/GuestLinkConflictDialog.js': 9,
  'components/GuestManagementPage.js': 55,
  'components/ImportProgressDialog.js': 9,
  'components/ImportProgressIndicator.js': 3,
  'components/IngredientCatalogSearchModal.js': 5,
  'components/IngredientIDSelect.js': 6,
  'components/KalibrierungsAuswertung.js': 14,
  'components/Kueche.js': 33,
  'components/Login.js': 18,
  'components/MeineKuechenstarsPage.js': 9,
  'components/MemberProfilePage.js': 6,
  'components/MenuDetail.js': 51,
  'components/MenuFilterSidebar.js': 11,
  'components/MenuForm.js': 78,
  'components/MenuList.js': 20,
  'components/MenuSharePage.js': 3,
  'components/MobileSearchOverlay.js': 30,
  'components/NetworkPage.js': 17,
  'components/NutritionModal.js': 52,
  'components/OcrScanModal.js': 38,
  'components/PasswordChangeModal.js': 8,
  'components/PrintFormatEditor.js': 1,
  'components/PrintPage.js': 2,
  'components/RatingModal.js': 21,
  'components/RecipeCard.js': 6,
  'components/RecipeDetail.js': 150,
  'components/RecipeFilterSidebar.js': 34,
  'components/RecipeForm.js': 112,
  'components/RecipeImageCarousel.js': 3,
  'components/RecipeImportModal.js': 11,
  'components/RecipeList.js': 21,
  'components/RecipeRating.js': 10,
  'components/RecipeTimeline.js': 5,
  'components/RecipeTypeahead.js': 3,
  'components/RecipeVersionDescribe.js': 11,
  'components/Register.js': 12,
  'components/SharePage.js': 3,
  'components/ShoppingListModal.js': 10,
  'components/SortCarousel.js': 1,
  'components/SplashScreen.js': 2,
  'components/Startseite.js': 24,
  'components/StartseitenKarussell.js': 1,
  'components/Tagesmenu.js': 26,
  'components/TagesmenuFilterOverlay.js': 10,
  'components/TemplateFormatEditor.js': 1,
  'components/TrendingCard.js': 2,
  'components/TutorialCard.js': 2,
  'components/TutorialForm.js': 32,
  'components/TutorialVideoModal.js': 2,
  'components/UndoSnackbar.js': 1,
  'components/UniversalImportModal.js': 17,
  'components/WebImportModal.js': 9,
  'components/WeinDazu.js': 16,
  'components/Weinbegleitung.js': 23,
  'components/WeinbegleitungSeite.js': 24,
  'components/WeinbegleitungTeile.js': 1,
  'components/WeinprofilEinblick.js': 9,
  'components/WichtelPage.js': 66,
  'components/WichtelTeilnehmerFormular.js': 11,
  'components/printEditor/EditorCanvas.js': 3,
  'components/printEditor/EditorToolbar.js': 11,
  'components/printEditor/ElementPropsPanel.js': 30,
  'components/printElementRenderers.js': 3,
  'components/templateEditor/FloatingToolbar.js': 19,
  'components/templateEditor/StylePanel.js': 26,
  'components/templateEditor/TemplateGallery.js': 1,
  'contexts/FollowContext.js': 1,
};

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return ['__tests__', '__mocks__', 'i18n'].includes(entry.name) ? [] : files(full);
    if (!/\.jsx?$/.test(entry.name) || /\.test\.jsx?$/.test(entry.name)) return [];
    if (['setupTests.js', 'test-utils.js'].includes(entry.name)) return [];
    return [full];
  });
}

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  Object.keys(node).forEach((key) => {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra') return;
    const value = node[key];
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else if (value && typeof value.type === 'string') walk(value, visit);
  });
}

// Feste Texte in einem Ausdruck. Aufrufe wie t('schluessel') zählen nicht: Ihre
// Zeichenketten sind Schlüssel, kein Text.
function festeTexte(ausdruck) {
  if (!ausdruck) return 0;
  switch (ausdruck.type) {
    case 'StringLiteral': return BUCHSTABEN.test(ausdruck.value) ? 1 : 0;
    case 'TemplateLiteral': return ausdruck.quasis.some((q) => BUCHSTABEN.test(q.value.cooked || '')) ? 1 : 0;
    case 'ConditionalExpression': return festeTexte(ausdruck.consequent) + festeTexte(ausdruck.alternate);
    case 'LogicalExpression': return festeTexte(ausdruck.left) + festeTexte(ausdruck.right);
    case 'JSXExpressionContainer': return festeTexte(ausdruck.expression);
    default: return 0;
  }
}

function zaehleTexte(source) {
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  let anzahl = 0;
  walk(ast.program, (node) => {
    if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
      node.children.forEach((kind) => {
        if (kind.type === 'JSXText') anzahl += BUCHSTABEN.test(kind.value) ? 1 : 0;
        else if (kind.type === 'JSXExpressionContainer') anzahl += festeTexte(kind.expression);
      });
    }
    if (node.type === 'JSXAttribute' && node.name.type === 'JSXIdentifier' && TEXT_ATTRIBUTE.has(node.name.name)) {
      anzahl += festeTexte(node.value);
    }
  });
  return anzahl;
}

describe('Mehrsprachigkeit: keine fest eingetippten UI-Texte', () => {
  const gefunden = {};
  files(SRC).forEach((file) => {
    const relativ = path.relative(SRC, file).split(path.sep).join('/');
    if (NUR_DEUTSCH.has(relativ)) return;
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes('<')) return;
    const anzahl = zaehleTexte(source);
    if (anzahl > 0) gefunden[relativ] = anzahl;
  });

  it('bringt keine neuen festen Texte ins JSX (Wörterbuch in src/i18n/texte/ und useTexte nutzen)', () => {
    const verstoesse = Object.entries(gefunden)
      .filter(([file, anzahl]) => anzahl > (BASELINE[file] || 0))
      .map(([file, anzahl]) => `${file}: ${anzahl} feste Texte (erlaubt: ${BASELINE[file] || 0})`);
    expect(verstoesse).toEqual([]);
  });

  it('hält die Baseline aktuell (wer eine Datei umstellt, senkt ihren Wert)', () => {
    const veraltet = Object.entries(BASELINE)
      .filter(([file, erlaubt]) => (gefunden[file] || 0) < erlaubt)
      .map(([file, erlaubt]) => `${file}: Baseline ${erlaubt}, gefunden ${gefunden[file] || 0}`);
    expect(veraltet).toEqual([]);
  });

  it('NUR_DEUTSCH nennt nur vorhandene Dateien, die nicht auch in der Baseline stehen', () => {
    const falsch = [...NUR_DEUTSCH].filter((file) => !fs.existsSync(path.join(SRC, file)) || file in BASELINE);
    expect(falsch).toEqual([]);
  });

  it('zählt Textknoten, feste Zeichenketten und Text-Attribute, aber keine Schlüssel', () => {
    const beispiel = `
      export function Beispiel({ t, n }) {
        return (
          <div title="Titel" aria-label={t('x')} className="klasse">
            Hallo
            {' '}
            {n > 1 ? 'Viele' : 'Einer'}
            {t('speichern')}
            <img alt="" />
            <input placeholder={\`Suche nach \${n}\`} />
            &nbsp;&ndash;&nbsp;
            {n && <span>{n}</span>}
          </div>
        );
      }`;
    // title, Hallo, Viele, Einer, placeholder
    expect(zaehleTexte(beispiel)).toBe(5);
  });
});
