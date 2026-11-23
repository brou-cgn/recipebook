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
  // Einstellungen › Listen & Kategorien: Übersetzungen der Listen (Mehrsprachigkeit PR 5)
  'components/ListenUebersetzungen.js',
  'components/NutritionReferenceTab.js',
  'components/PrintFormatsSettings.js',
  'components/SeasonMatrixTab.js',
  'components/Settings.js',
  // Einstellungen › KI: Backfill der Titel- und Inhaltsübersetzungen (Mehrsprachigkeit PR 3 und 4)
  'components/UebersetzungBackfill.js',
  'components/UserManagement.js',
  // „Einschätzung im Detail“ in „Wein dazu“: Diagnoseansicht mit der Berechtigung weinprofilEinblick,
  // standardmäßig nur für Admins (Mehrsprachigkeit PR 6c)
  'components/WeinprofilEinblick.js',
  // „Profile nachtragen“ auf der Seite Weinbegleitung: nur für die Rolle admin (Mehrsprachigkeit PR 6o)
  'components/WeinprofilNachtragen.js',
  // „Verwaltung“ in „Chefkoch & mehr“ (Kueche.js), nur mit den Berechtigungen appCalls oder eventplanung: die
  // App-Aufrufe und die Eventplanung mit Kalibrierung (Entscheidung vom 23.11.2026). Die Kacheln dorthin sind übersetzt.
  'components/CallLogPanel.js',
  'components/EventplanungPage.js',
  'components/KalibrierungsAuswertung.js',
  // Einstellungen › Druckformate: Druck- und Vorlagen-Editor, nur über PrintFormatsSettings erreichbar
  // (Mehrsprachigkeit PR 6h). Die Druckausgabe selbst (printElementRenderers.js) folgt mit Phase B.
  'components/PrintFormatEditor.js',
  'components/TemplateFormatEditor.js',
  'components/printEditor/EditorCanvas.js',
  'components/printEditor/EditorToolbar.js',
  'components/printEditor/ElementPropsPanel.js',
  'components/printEditor/VisibilityChips.js',
  'components/templateEditor/FloatingToolbar.js',
  'components/templateEditor/Segmented.js',
  'components/templateEditor/StylePanel.js',
  'components/templateEditor/TemplateGallery.js',
]);

// Stand 23.11.2026 (PR 6s: Gruppen und Netzwerk): 85 Textstellen in 5 Dateien.
const BASELINE = {
  'components/FlowPage.js': 3,
  'components/PrintPage.js': 2,
  'components/WichtelPage.js': 66,
  'components/WichtelTeilnehmerFormular.js': 11,
  'components/printElementRenderers.js': 3,
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
