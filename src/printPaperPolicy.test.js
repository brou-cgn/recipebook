/**
 * Tech-Check P21: Druckvorschau und Ausdruck sind Papier, weiß mit dunkler Schrift, auch im
 * Dunkelmodus. darkMode.css färbt h1–h6, p, span, label und li dort pauschal hell
 * ([data-theme="dark"] li usw., Spezifität 0-1-1), und printRunner druckt im selben Dokument. Auf dem
 * Blatt erben diese Elemente deshalb die Farbe (color: inherit): .ppf-sheet in FlowPage.css. Seit dem
 * Wegfall des freien Layouts (Vorhaben Drucklayout, Stufe 1) ist das die einzige Seitenart.
 *
 * Eigene Textfarben für Klassen auf diesen Elementen brauchen dann mehr als 0-1-1, also das Blatt
 * davor (.ppf-sheet .klasse), sonst gewinnt das Erben bzw. im Dunkelmodus die pauschale Regel. Das
 * gilt in beiden Dateien, die das Blatt gestalten: FlowPage.css und PrintPage.css (Teile des Rezepts).
 */
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
const PAPER = [
  { css: 'components/print/FlowPage.css', root: '.ppf-sheet' },
];
/** Stylesheets, die Elemente auf dem Blatt gestalten */
const PAPER_CSS = ['components/print/PrintPage.css', 'components/print/FlowPage.css'];
const RENDERERS = ['components/print/printElementRenderers.js', 'components/print/PrintPage.js', 'components/print/FlowPage.js'];

/** Regeln einer CSS-Datei (Inhalt von @media-Blöcken eingeschlossen), ohne Kommentare. */
function cssRules(css) {
  const rules = [];
  const pattern = /([^{}@;]+)\{([^{}]*)\}/g;
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let match;
  while ((match = pattern.exec(text))) rules.push({ selectors: match[1].split(',').map((s) => s.trim()), body: match[2] });
  return rules;
}

const colorOf = (body) => (/(?:^|;|\s)color\s*:\s*([^;]+)/.exec(body) || [])[1]?.trim();

/** Elemente, denen darkMode.css pauschal eine Textfarbe gibt ([data-theme="dark"] p, … { color: … }). */
function darkTextElements() {
  const elements = new Set();
  cssRules(read('darkMode.css')).forEach(({ selectors, body }) => {
    if (!colorOf(body)) return;
    const plain = selectors.map((s) => /^\[data-theme="dark"\]\s+([a-z][a-z0-9]*)$/.exec(s));
    if (plain.some((m) => !m)) return;
    plain.forEach((m) => { if (m[1] !== 'body') elements.add(m[1]); });
  });
  return elements;
}

/** Klassen, die die Druck-Renderer auf diese Elemente setzen (Näherung über den Quelltext). */
function paperTextClasses(elements) {
  const classes = new Set();
  const tag = /<([a-z][a-z0-9]*)\b[^>]*?className=(?:"([^"]+)"|\{`([^`]+)`\})/g;
  RENDERERS.forEach((file) => {
    let match;
    const source = read(file);
    while ((match = tag.exec(source))) {
      if (!elements.has(match[1])) continue;
      (match[2] || match[3]).replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)
        .filter((c) => /^[A-Za-z_-][\w-]*$/.test(c)).forEach((c) => classes.add(c));
    }
  });
  return classes;
}

/** [IDs, Klassen/Attribute/Pseudoklassen, Elemente] eines Selektors (Näherung wie in darkTextPolicy). */
function specificity(selector) {
  const ids = (selector.match(/#[\w-]+/g) || []).length;
  const classes = (selector.match(/\.[\w-]+|\[[^\]]+\]|:(?!not\b|is\b)[\w-]+(\([^)]*\))?/g) || []).length;
  const elements = (selector.replace(/\[[^\]]+\]|\([^)]*\)/g, '').match(/(^|[\s>+~(])([a-z][\w-]*)/gi) || []).length;
  return [ids, classes, elements];
}

const strongerThanDarkRule = ([ids, classes, elements]) => ids > 0 || classes > 1 || (classes === 1 && elements > 1);

describe('Papier der Druckvorschau und des Ausdrucks (Tech-Check P21)', () => {
  const elements = darkTextElements();

  it('kennt die Elemente der pauschalen Textfarbe aus darkMode.css', () => {
    expect([...elements]).toEqual(expect.arrayContaining(['h1', 'h2', 'p', 'span', 'label', 'li']));
  });

  it.each(PAPER)('$root lässt jedes dieser Elemente die Farbe erben ($css)', ({ css, root }) => {
    const inherited = new Set();
    cssRules(read(css)).forEach(({ selectors, body }) => {
      if (colorOf(body) !== 'inherit') return;
      selectors.forEach((s) => {
        const m = new RegExp(`^\\${root}\\s+([a-z][a-z0-9]*)$`).exec(s);
        if (m) inherited.add(m[1]);
      });
    });
    expect([...elements].filter((el) => !inherited.has(el))).toEqual([]);
  });

  it('setzt eigene Textfarben auf dem Papier stärker als 0-1-1', () => {
    const classes = paperTextClasses(elements);
    const weak = [];
    PAPER_CSS.forEach((css) => {
      cssRules(read(css)).forEach(({ selectors, body }) => {
        const color = colorOf(body);
        if (!color || color === 'inherit') return;
        selectors.forEach((s) => {
          const last = s.split(/\s+|>|\+|~/).filter(Boolean).pop() || '';
          const hit = (last.match(/\.[A-Za-z_-][\w-]*/g) || []).some((c) => classes.has(c.slice(1)));
          if (hit && !strongerThanDarkRule(specificity(s))) weak.push(`${css}: ${s}`);
        });
      });
    });
    expect(weak).toEqual([]);
  });
});
