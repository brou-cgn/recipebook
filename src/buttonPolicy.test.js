/**
 * Button-System (Tech-Check A8, AGENTS.md, UI-Regeln): Knöpfe nutzen components/Button.js mit
 * den Rollen primary, secondary, danger, danger-quiet und ghost, statt eigener Knopf-Klassen je
 * Bildschirm (das Interface Inventory vom 21.11.2026 fand 21 Varianten allein für „Speichern“).
 *
 * Gezählt werden je CSS-Datei die Regeln, die eine eigene Knopf-Klasse mit Fläche gestalten:
 * die letzte Stufe des Selektors trägt eine Klasse mit „btn“ oder „button“ im Namen, und die
 * Regel setzt background oder background-color auf eine Farbe. Ausgenommen sind Bausteine
 * außerhalb des Systems: schwebende runde Knöpfe (fab), DeleteRowButton und sein neutrales Gegenstück
 * RowIconButton, Chips, Tabs, Schalter, Pillen, Bilder in Knöpfen (image, img), die Werkzeug-Schalter
 * des Vorlagen-Editors der Druckformate
 * (Fett/Kursiv, Ausrichtung, Segmente, schwebende Werkzeugleiste: umschaltbare Formatierung, keine
 * Aktion mit Rolle), Symbol-Knöpfe ohne Text (konfigurierbare Icons, Suche und Menü in der Kopfzeile,
 * Suchfeld leeren), die Bedienelemente der Rezeptansicht mit eigener Gestalt (Plus/Minus der Portionen,
 * Timer, Alarm) und Zeilen als Knopf (Fragen der Hilfe, Namen in Verwaltungslisten). Ebenso gezählt
 * werden Knöpfe, die ihr Container gestaltet (letzte Stufe ist das Element button, etwa
 * „.list-input button“, so fielen acht Hinzufügen-Knöpfe durch); ausgenommen sind dort Einträge in
 * Auswahllisten und Kontextmenüs.
 * Bestand als Baseline, darf nur sinken; neue Dateien starten bei 0.
 */
const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const EXEMPT_FILES = ['tokens.css', 'darkMode.css', 'Button.css'];
const BUTTON_CLASS = /(^|[-_])(btn|button)([-_]|$)/;
const OUTSIDE_SYSTEM = /fab|delete-row|row-icon|chip|tab|toggle|switch|pill|ui-button|image|img/;
const NO_SURFACE = /^(transparent|none|inherit|initial|unset|revert)(\s*!important)?$/i;
// Werkzeug-Schalter des Vorlagen-Editors (print/templateEditor/Segmented.js und FloatingToolbar.js):
// aria-pressed bzw. role="radio", gehören nicht ins Rollen-System
const EDITOR_TOOLS = /^(tfe-seg-btn|tfe-tb-btn)/;
// Symbol-Knöpfe ohne Text: Ihre Gestalt ist das Symbol, keine Rolle, daher nicht über components/Button.js.
// Die Symbole, die unter „Bilder & Icons“ konfigurierbar sind (Rezeptansicht: Favorit, Privat, Kochdatum;
// Rezeptformular: Zutat/Schritt hinzufügen, Webimport, Foto-Scan, Import; Rezept- und Menüliste: Filter, Favoriten,
// Rezept hinzufügen, am Handy schwebend; Startseite: Rezept zur Sammlung hinzufügen; Nährwert-Dialog: automatisch
// berechnen; Rezept-, Menü- und Gruppenansicht: Einkaufsliste; Tagesmenü, schwebend: Filter, Meine Auswahl, zum
// Tagesmenü und zurück zum Stapel), dazu Suche und Menü in der Kopfzeile und das Leeren eines Suchfelds
const ICON_BUTTONS = /^(favorite-button|shopping-list-trigger-button|tagesmenu-(filter|meine-auswahl|zum-tagesMenu|zurueck-zum-stapel)-btn|private-badge-button|cook-date-button|add-item-button|import-button-header|ocr-scan-button-header|webimport-button-header|filter-button|menu-favorites-filter-button|add-icon-button|startseite-add-recipe-btn|nutrition-autocalc-header-btn|search-btn|search-clear-btn|mobile-search-clear-btn|hamburger-btn)/;
// Bedienelemente der Rezeptansicht und des Kochmodus mit eigener Gestalt: Plus/Minus der Portionen, Timer im
// Schritt, Kacheln der Kochsitzung, Bring! (Marke) und der Alarm-Knopf des Timers (eigene Alarmfarbe --color-alarm)
const RECIPE_CONTROLS = /^(serving-btn|portion-selector-btn|step-timer-start-btn|cooking-rail-button|shopping-list-bring-btn|alarm-modal-stop-btn)/;
// Zeilen als Knopf sind Listenzeilen, keine Knöpfe des Systems: Aufklapp-Zeilen (aria-expanded) wie die Fragen der
// Hilfe und Namen in Verwaltungslisten, die ihre Bearbeitung öffnen (Icon-Verwaltung, Speisekategorien)
const ROW_BUTTONS = /^(faq-question-btn|bia-row-name-btn)/;
const OWN_SHAPES = [EDITOR_TOOLS, ICON_BUTTONS, RECIPE_CONTROLS, ROW_BUTTONS];
const BARE_BUTTON = /^button(?![\w-])/;
// Einträge in Auswahllisten und Kontextmenüs sind Listenzeilen, keine Knöpfe des Systems
const LIST_CONTAINER = /dropdown|context-menu|typeahead|matches|suggest|autocomplete/;

const BASELINE = {
  'components/FollowButton.css': 1,
  'components/GroupDetail.css': 7,
  'components/MemberProfilePage.css': 2,
  'components/NetworkPage.css': 2,
  'components/PortionSelector.css': 2,
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
      return classes.some((c) => BUTTON_CLASS.test(c) && !OUTSIDE_SYSTEM.test(c) && !OWN_SHAPES.some((shape) => shape.test(c)));
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
      .tfe-tb-btn--active { background: #5a3e2b; }
      .tfe-seg-btn { background: #fff; }
      .favorite-button--active { background: #fde8e8; }
      .serving-btn:hover { background: #402c1c; }
      .search-btn:hover { background: rgba(0, 0, 0, 0.06); }
      .menu-favorites-filter-button.active { background: #df7a00; }
      .faq-question-btn:hover { background: #f5f5f5; }
      .bia-row-name-btn:hover { background: #f5f5f5; }
      .row-icon-button:hover { background: var(--color-hover-overlay); }
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
