/**
 * scripts/colorTokenCodemod.js (Tech-Check A5) darf nur ersetzen, was hell und dunkel
 * gleich aussieht. Die Fälle unten sind die Grenzen dieser Zusage.
 */
const { analyze } = require('../scripts/colorTokenCodemod');

const TOKENS = `
:root {
  --color-surface: #fff;
  --color-text: #333;
  --color-text-muted: #666;
  --color-border: #ddd;
  --color-brand: #402c1c;
  --color-accent: #df7a00;
}
[data-theme="dark"] {
  --color-surface: #2a2a2a;
  --color-text: #e8e8e8;
  --color-text-muted: #aaa;
  --color-border: #555;
  --color-brand: #e8e8e8;
  --color-accent: #df7a00;
}
`;

function migrate(css, { dark = '', textClasses = [] } = {}) {
  const sources = [{ rel: 'components/X.css', source: css }];
  if (dark) sources.push({ rel: 'darkMode.css', source: dark });
  const { outputs, report } = analyze({ sources, tokensCss: TOKENS, textClasses: new Set(textClasses) });
  return { css: outputs['components/X.css'] || css, report, outputs };
}

describe('Farb-Token-Codemod', () => {
  it('ersetzt Tokens mit gleichem Hell- und Dunkelwert ohne Dunkel-Regel (Fall A)', () => {
    expect(migrate('.a { color: #DF7A00; }').css).toBe('.a { color: var(--color-accent); }');
  });

  it('ersetzt, wenn eine Dunkel-Regel genau das Wertepaar eines Tokens ergibt (Fall B), und lässt sie stehen', () => {
    const dark = '[data-theme="dark"] .b { background: #2a2a2a; }';
    const { css, report, outputs } = migrate('.b { background: #fff; }', { dark });
    expect(css).toBe('.b { background: var(--color-surface); }');
    expect(outputs['darkMode.css']).toBeUndefined();
    expect(report.redundantDark).toEqual([{ file: 'components/X.css', selector: '.b', prop: 'background', token: 'surface' }]);
  });

  it('lässt Farben ohne Dunkel-Regel stehen, wenn das Token dunkel anders aussähe', () => {
    expect(migrate('.c { color: #333; }').css).toBe('.c { color: #333; }');
    expect(migrate('.c { background: #402c1c; color: #fff; }').css).toBe('.c { background: #402c1c; color: #fff; }');
  });

  it('nimmt Dunkel-Regeln nur, wenn sie überall gelten, wo die helle Regel gilt', () => {
    const dark = '@media (max-width: 600px) { [data-theme="dark"] .d { color: #e8e8e8; } }';
    expect(migrate('.d { color: #333; }', { dark }).css).toBe('.d { color: #333; }');
    const both = '[data-theme="dark"] .d { color: #e8e8e8; }';
    expect(migrate('@media (max-width: 600px) { .d { color: #333; } }', { dark: both }).css)
      .toBe('@media (max-width: 600px) { .d { color: var(--color-text); } }');
  });

  it('erkennt eine Farb-Langform als Dunkel-Regel für die Kurzform', () => {
    const dark = '[data-theme="dark"] .e { border-color: #555; }';
    expect(migrate('.e { border: 1px solid #ddd; }', { dark }).css).toBe('.e { border: 1px solid var(--color-border); }');
  });

  it('ersetzt Verläufe nur mit einer Dunkel-Regel, die den Verlauf selbst ersetzt', () => {
    const css = '.f { background: linear-gradient(135deg, #402c1c 0%, #fff 100%); }';
    expect(migrate(css, { dark: '[data-theme="dark"] .f { background-color: #e8e8e8; }' }).css).toBe(css);
    expect(migrate(css, { dark: '[data-theme="dark"] .f { background: linear-gradient(135deg, #e8e8e8 0%, #2a2a2a 100%); }' }).css)
      .toBe('.f { background: linear-gradient(135deg, var(--color-brand) 0%, var(--color-surface) 100%); }');
  });

  it('vergibt nur Tokens, die zur Eigenschaft passen (kein Text-Token als Hintergrund)', () => {
    const dark = '[data-theme="dark"] .n { background: #e8e8e8; }';
    expect(migrate('.n { background: #333; }', { dark }).css).toBe('.n { background: #333; }');
  });

  it('fasst Farben in url(...) und Strings nicht an', () => {
    const css = '.g { background: #df7a00 url("x.svg#df7a00"); }';
    expect(migrate(css).css).toBe('.g { background: var(--color-accent) url("x.svg#df7a00"); }');
  });

  it('lässt !important stehen, wenn die Dunkel-Regel es nicht auch hat', () => {
    const dark = '[data-theme="dark"] .h { color: #e8e8e8; }';
    expect(migrate('.h { color: #333 !important; }', { dark }).css).toBe('.h { color: #333 !important; }');
  });

  it('verlangt die Dunkel-Regel für jeden Selektor einer Liste', () => {
    const one = '[data-theme="dark"] .j { color: #aaa; }';
    expect(migrate('.j, .k { color: #666; }', { dark: one }).css).toBe('.j, .k { color: #666; }');
    const both = '[data-theme="dark"] .j, [data-theme="dark"] .k { color: #aaa; }';
    expect(migrate('.j, .k { color: #666; }', { dark: both }).css).toBe('.j, .k { color: var(--color-text-muted); }');
  });

  it('gibt Klassen auf p, span, label, li keine schwache Token-Textfarbe (darkTextPolicy, A7)', () => {
    const dark = '[data-theme="dark"] .i { color: #e8e8e8; }';
    expect(migrate('.i { color: #333; }', { dark, textClasses: ['i'] }).css).toBe('.i { color: #333; }');
    expect(migrate('.seite .i { color: #333; }', { dark: '[data-theme="dark"] .seite .i { color: #e8e8e8; }', textClasses: ['i'] }).css)
      .toBe('.seite .i { color: var(--color-text); }');
  });

  it('löst Tokens in Dunkel-Regeln auf und ändert darkMode.css nie', () => {
    const dark = '[data-theme="dark"] .l { color: var(--color-text); } .m { color: #df7a00; }';
    const { css, outputs } = migrate('.l { color: #333; }', { dark });
    expect(css).toBe('.l { color: var(--color-text); }');
    expect(outputs['darkMode.css']).toBeUndefined();
  });
});
