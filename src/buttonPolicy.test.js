/**
 * Button-System (Tech-Check A8, AGENTS.md, UI-Regeln): Knöpfe nutzen components/Button.js mit
 * den Rollen primary, secondary, danger, danger-quiet und ghost, statt eigener Knopf-Klassen je
 * Bildschirm (das Interface Inventory vom 21.11.2026 fand 21 Varianten allein für „Speichern“).
 *
 * Gezählt werden je CSS-Datei die Regeln, die eine eigene Knopf-Klasse mit Fläche gestalten:
 * die letzte Stufe des Selektors trägt eine Klasse mit „btn“ oder „button“ im Namen, und die
 * Regel setzt background oder background-color auf eine Farbe. Ausgenommen sind Bausteine
 * außerhalb des Systems: schwebende runde Knöpfe (fab), DeleteRowButton, Chips, Tabs, Schalter,
 * Pillen, Bilder in Knöpfen (image, img), die Werkzeug-Schalter der Druck- und Vorlagen-Editoren
 * (Fett/Kursiv, Ausrichtung, Segmente, schwebende Werkzeugleiste: umschaltbare Formatierung, keine
 * Aktion mit Rolle) und die Bedienelemente der Rezeptansicht mit eigener Gestalt (Symbol-Knöpfe mit
 * konfigurierbaren Icons, Plus/Minus der Portionen, Timer, Alarm). Ebenso gezählt werden Knöpfe, die ihr Container
 * gestaltet (letzte Stufe ist das Element button, etwa „.list-input button“, so fielen acht
 * Hinzufügen-Knöpfe durch); ausgenommen sind dort Einträge in Auswahllisten und Kontextmenüs.
 * Bestand als Baseline, darf nur sinken; neue Dateien starten bei 0.
 */
const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const EXEMPT_FILES = ['tokens.css', 'darkMode.css', 'Button.css'];
const BUTTON_CLASS = /(^|[-_])(btn|button)([-_]|$)/;
const OUTSIDE_SYSTEM = /fab|delete-row|chip|tab|toggle|switch|pill|ui-button|image|img/;
const NO_SURFACE = /^(transparent|none|inherit|initial|unset|revert)(\s*!important)?$/i;
// Werkzeug-Schalter der Editoren (printEditor/ElementPropsPanel.js, templateEditor/Segmented.js und
// FloatingToolbar.js): aria-pressed bzw. role="radio", gehören nicht ins Rollen-System
const EDITOR_TOOLS = /^(pfe-style-btn|pfe-align-btn|tfe-seg-btn|tfe-tb-btn)/;
// Bedienelemente der Rezeptansicht und des Kochmodus mit eigener Gestalt: Symbol-Knöpfe der Aktionszeile
// (Icons unter „Bilder & Icons“ konfigurierbar: Favorit, Privat, Kochdatum, Drucken), Plus/Minus der
// Portionen, Timer im Schritt, Kacheln der Kochsitzung, Bring! (Marke) und der Alarm-Knopf des Timers
// (eigene Alarmfarbe --color-alarm). Kein Rollen-Knopf, daher nicht über components/Button.js
const RECIPE_CONTROLS = /^(favorite-button|private-badge-button|cook-date-button|serving-btn|portion-selector-btn|step-timer-start-btn|cooking-rail-button|shopping-list-bring-btn|alarm-modal-stop-btn)/;
const BARE_BUTTON = /^button(?![\w-])/;
// Einträge in Auswahllisten und Kontextmenüs sind Listenzeilen, keine Knöpfe des Systems
const LIST_CONTAINER = /dropdown|context-menu|typeahead|matches|suggest|autocomplete/;

const BASELINE = {
  'App.css': 1,
  'components/AtelierOnboardingOverlay.css': 2,
  'components/AtelierTasteIntroOverlay.css': 2,
  'components/ButtonIconsAdminTab.css': 4,
  'components/DrinkWeightsTab.css': 2,
  'components/EventsPage.css': 6,
  'components/FollowButton.css': 1,
  'components/GroupDetail.css': 8,
  'components/Header.css': 8,
  'components/ImportProgressDialog.css': 2,
  'components/MemberProfilePage.css': 2,
  'components/MenuFilterSidebar.css': 2,
  'components/MenuForm.css': 6,
  'components/MenuList.css': 2,
  'components/MobileSearchOverlay.css': 1,
  'components/NetworkPage.css': 2,
  'components/NutritionModal.css': 5,
  'components/OcrScanModal.css': 1,
  'components/PortionSelector.css': 2,
  'components/PrintFormatEditor.css': 2,
  'components/RecipeFilterSidebar.css': 2,
  'components/RecipeForm.css': 13,
  'components/RecipeImportModal.css': 1,
  'components/RecipeList.css': 8,
  'components/SeasonMatrixTab.css': 2,
  'components/Settings.css': 8,
  'components/SharePage.css': 2,
  'components/Startseite.css': 10,
  'components/Tagesmenu.css': 5,
  'components/UserManagement.css': 6,
  'components/WichtelPage.css': 2,
  'components/WichtelTeilnahmePage.css': 1,
};

function cssFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(full);
    return /\.css$/.test(entry.name) && !EXEMPT_FILES.includes(entry.name) ? [full] : [];
  });
}

/** Regeln (auch in @media) als {selector, body}, ohne Kommentare. */
function cssRules(css) {
  const rules = [];
  const pattern = /([^{}@;]+)\{([^{}]*)\}/g;
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let match;
  while ((match = pattern.exec(text))) rules.push({ selector: match[1].trim(), body: match[2] });
  return rules;
}

function ownButtonRules(css) {
  return cssRules(css).filter(({ selector, body }) => {
    const surface = /(?:^|;|\s)background(?:-color)?\s*:\s*([^;]+)/.exec(body);
    if (!surface || NO_SURFACE.test(surface[1].trim())) return false;
    return selector.split(',').some((single) => {
      const parts = single.trim().split(/\s+|>|\+|~/).filter(Boolean);
      const last = parts[parts.length - 1] || '';
      const classes = (last.match(/\.[A-Za-z_-][\w-]*/g) || []).map((c) => c.slice(1));
      if (BARE_BUTTON.test(last)) {
        const containers = (single.match(/\.[A-Za-z_-][\w-]*/g) || []).map((c) => c.slice(1));
        return !classes.some((c) => OUTSIDE_SYSTEM.test(c)) && !containers.some((c) => LIST_CONTAINER.test(c));
      }
      return classes.some((c) => BUTTON_CLASS.test(c) && !OUTSIDE_SYSTEM.test(c) && !EDITOR_TOOLS.test(c) && !RECIPE_CONTROLS.test(c));
    });
  });
}

describe('Button-System (Tech-Check A8)', () => {
  const counts = {};
  cssFiles(SRC).forEach((file) => {
    const n = ownButtonRules(fs.readFileSync(file, 'utf8')).length;
    if (n > 0) counts[path.relative(SRC, file).split(path.sep).join('/')] = n;
  });

  it('gestaltet keine neuen eigenen Knöpfe mit Fläche; dafür components/Button.js nutzen', () => {
    const violations = Object.entries(counts)
      .filter(([file, n]) => n > (BASELINE[file] || 0))
      .map(([file, n]) => `${file}: ${n} Regeln für eigene Knöpfe mit Fläche (erlaubt: ${BASELINE[file] || 0}); <Button variant="…"> aus components/Button.js nutzen`);
    expect(violations).toEqual([]);
  });

  it('hält die Baseline aktuell (umgestellte Knöpfe senken den Wert)', () => {
    const stale = Object.entries(BASELINE)
      .filter(([file, n]) => (counts[file] || 0) < n)
      .map(([file, n]) => `${file}: Baseline ${n}, tatsächlich ${counts[file] || 0}`);
    expect(stale).toEqual([]);
  });

  it('erkennt eigene Knöpfe und lässt Bausteine außerhalb des Systems aus', () => {
    const css = `
      .save-btn { background: #402c1c; }
      .save-btn:hover { background-color: var(--color-brand); }
      .card .share-button { background: #fff; }
      .ghost-btn { background: transparent; }
      .edit-fab-button { background: white; }
      .filter-chip-btn { background: #eee; }
      .settings-tab-button { background: #eee; }
      .button-icon-image { background: #fff; }
      .row > .icon-wrap { background: #fff; }
      .list-input button { background: #402c1c; }
      .list-input > button:hover { background: #1a1a1a; }
      .toolbar button.ui-button { background: #fff; }
      .unit-typeahead-dropdown button:hover { background: #eee; }
      .ingredient-context-menu button:hover { background: #eee; }
      .pfe-style-btn--active { background: #5a3e2b; }
      .tfe-seg-btn { background: #fff; }
      .favorite-button--active { background: #fde8e8; }
      .serving-btn:hover { background: #402c1c; }
    `;
    expect(ownButtonRules(css).map((r) => r.selector)).toEqual([
      '.save-btn',
      '.save-btn:hover',
      '.card .share-button',
      '.list-input button',
      '.list-input > button:hover',
    ]);
  });
});
