/**
 * Tech-Check A7: darkMode.css setzt die Textfarbe von p, span, label und li im Dunkelmodus
 * pauschal auf #e8e8e8 ([data-theme="dark"] p usw., Spezifität 0-1-1). Eine Komponenten-
 * Regel, die solchen Elementen eine Token-Farbe gibt (color: var(--color-…)), verliert
 * dagegen, wenn ihr Selektor schwächer ist – etwa eine einzelne Klasse (0-1-0): Im
 * Dunkelmodus wird dann z. B. ein roter Fehlertext weiß.
 *
 * Bis die pauschale Regel abgelöst ist (dafür müssen erst die Regeln mit festen Textfarben
 * auf Tokens umgestellt werden, die heute nur durch sie lesbar sind), gilt: Token-Textfarben
 * für Klassen auf p, span, label oder li brauchen mindestens Spezifität 0-1-1, z. B.
 * `.seite .hinweis` oder `span.hinweis` (AGENTS.md, UI-Regeln).
 *
 * Gezählt werden je CSS-Datei die Selektoren mit Token-Textfarbe, deren letzte Stufe eine
 * Klasse trägt, die im JSX auf p, span, label oder li vorkommt, und deren Spezifität
 * darunter liegt. Bestand als Baseline, darf nur sinken; neue Dateien starten bei 0.
 * Näherung: Eine Klasse, die auch auf anderen Elementen sitzt, zählt mit.
 */
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');

const SRC = __dirname;
const TEXT_ELEMENTS = new Set(['p', 'span', 'label', 'li']);

// Stand 20.11.2026 (Tech-Check A7): 73 Selektoren in 15 Dateien, vor allem neuere Bereiche.
const BASELINE = {
  'components/ConfirmDialog.css': 1,
  'components/CookingAddRecipeSheet.css': 5,
  'components/CookingAlarmModal.css': 2,
  'components/CookingSessionCarousel.css': 6,
  'components/CookingSessionRail.css': 2,
  'components/EventsPage.css': 2,
  'components/IngredientCatalogSearchModal.css': 3,
  'components/MemberProfilePage.css': 1,
  'components/NetworkPage.css': 4,
  'components/RecipeVersionDescribe.css': 1,
  'components/WeinDazu.css': 10,
  'components/Weinbegleitung.css': 15,
  'components/WeinbegleitungSeite.css': 8,
  'components/WeinprofilEinblick.css': 3,
  'components/WichtelPage.css': 10,
};

function files(dir, pattern) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' || entry.name === '__mocks__' ? [] : files(full, pattern);
    return pattern.test(entry.name) ? [full] : [];
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

/** Klassen, die im JSX auf p, span, label oder li stehen (Text der className-Ausdrücke). */
function textElementClasses() {
  const classes = new Set();
  files(SRC, /\.jsx?$/).filter((file) => !/\.test\.jsx?$/.test(file)).forEach((file) => {
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes('className')) return;
    const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
    walk(ast.program, (node) => {
      if (node.type !== 'JSXOpeningElement' || node.name.type !== 'JSXIdentifier' || !TEXT_ELEMENTS.has(node.name.name)) return;
      const attr = node.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === 'className');
      if (!attr) return;
      const texts = [];
      walk(attr.value, (child) => {
        if (child.type === 'StringLiteral') texts.push(child.value);
        if (child.type === 'TemplateElement') texts.push(child.value.cooked || '');
      });
      texts.join(' ').split(/\s+/).filter((c) => /^[A-Za-z_-][\w-]*$/.test(c)).forEach((c) => classes.add(c));
    });
  });
  return classes;
}

/** Regeln einer CSS-Datei (Inhalt von @media-Blöcken eingeschlossen), ohne Kommentare. */
function cssRules(css) {
  const rules = [];
  const pattern = /([^{}@;]+)\{([^{}]*)\}/g;
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let match;
  while ((match = pattern.exec(text))) rules.push({ selector: match[1].trim(), body: match[2] });
  return rules;
}

/** [IDs, Klassen/Attribute/Pseudoklassen, Elemente] eines Selektors (Näherung). */
function specificity(selector) {
  const s = selector.replace(/::?(before|after|placeholder|marker|selection|first-line|first-letter)\b/g, '')
    .replace(/:(where)\([^)]*\)/g, '');
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const classes = (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!not\b|is\b)[\w-]+(\([^)]*\))?/g) || []).length;
  const elements = (s.replace(/\[[^\]]+\]|\([^)]*\)/g, '').match(/(^|[\s>+~(])([a-z][\w-]*)/gi) || []).length;
  return [ids, classes, elements];
}

/** Liegt die Spezifität unter der der pauschalen Dark-Regel (0-1-1)? */
const weakerThanDarkRule = ([ids, classes, elements]) => ids === 0 && (classes === 0 || (classes === 1 && elements === 0));

function lastCompoundClasses(selector) {
  const parts = selector.trim().split(/\s+|>|\+|~/).filter(Boolean);
  return ((parts[parts.length - 1] || '').match(/\.[A-Za-z_-][\w-]*/g) || []).map((c) => c.slice(1));
}

function overriddenTokenColors(css, classes) {
  const found = [];
  cssRules(css).forEach(({ selector, body }) => {
    const color = /(?:^|;|\s)color\s*:\s*([^;]+)/.exec(body);
    if (!color || !/^var\(--color-/.test(color[1].trim())) return;
    selector.split(',').map((s) => s.trim()).forEach((single) => {
      if (/data-theme/.test(single)) return;
      if (!lastCompoundClasses(single).some((c) => classes.has(c))) return;
      if (weakerThanDarkRule(specificity(single))) found.push(single);
    });
  });
  return found;
}

describe('Textfarben im Dunkelmodus (Tech-Check A7)', () => {
  const classes = textElementClasses();
  const found = {};
  files(SRC, /\.css$/).filter((file) => !/(darkMode|tokens)\.css$/.test(file)).forEach((file) => {
    const hits = overriddenTokenColors(fs.readFileSync(file, 'utf8'), classes);
    if (hits.length > 0) found[path.relative(SRC, file).split(path.sep).join('/')] = hits;
  });

  it('gibt Klassen auf p, span, label und li keine neuen Token-Textfarben, die der Dunkelmodus überstimmt', () => {
    const violations = Object.entries(found)
      .filter(([file, hits]) => hits.length > (BASELINE[file] || 0))
      .map(([file, hits]) =>
        `${file}: ${hits.length} Token-Textfarben mit Spezifität unter 0-1-1 (erlaubt: ${BASELINE[file] || 0}); ` +
        `Selektor verstärken, z. B. ".seite .klasse" – ${hits.join(', ')}`);
    expect(violations).toEqual([]);
  });

  it('hält die Baseline aktuell (verstärkte oder entfernte Regeln senken den Wert)', () => {
    const stale = Object.entries(BASELINE)
      .filter(([file, n]) => (found[file] || []).length < n)
      .map(([file, n]) => `${file}: Baseline ${n}, tatsächlich ${(found[file] || []).length}`);
    expect(stale).toEqual([]);
  });

  it('bewertet Selektoren gegen die Dark-Regel [data-theme="dark"] span (0-1-1)', () => {
    const css = `
      .hinweis { color: var(--color-danger); }
      .seite .hinweis { color: var(--color-danger); }
      span.hinweis, .fehler:hover { color: var(--color-text-muted); }
      .hinweis.aktiv { color: var(--color-accent); }
      .hinweis { color: #c00; }
      .anderes { color: var(--color-danger); }
      @media (max-width: 600px) { .fehler { color: var(--color-danger); } }
    `;
    expect(overriddenTokenColors(css, new Set(['hinweis', 'fehler']))).toEqual(['.hinweis', '.fehler']);
    expect(specificity('.a .b span')).toEqual([0, 2, 1]);
    expect(specificity('#x .a::before')).toEqual([1, 1, 0]);
  });
});
