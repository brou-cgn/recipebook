#!/usr/bin/env node
/**
 * Farb-Token-Codemod (Tech-Check A5): ersetzt feste Hex-Farben in Komponenten-CSS durch
 * Tokens aus src/tokens.css, aber nur dort, wo sich dadurch nichts sichtbar ändert –
 * weder hell noch dunkel.
 *
 * Warum so eng: Ein Token hat zwei Werte. Wer `#402c1c` durch `var(--color-brand)` ersetzt,
 * ändert den Dunkelmodus überall dort, wo darkMode.css die Regel nicht überschreibt (dort
 * zeigt die App heute im Dunkelmodus weiter #402c1c, mit dem Token wäre es #e8e8e8). Das
 * kann eine Lücke schließen oder einen braunen Button mit weißer Schrift unlesbar machen.
 * Das lässt sich nur im Browser entscheiden. Dieses Skript lässt solche Stellen stehen und
 * listet sie nur auf (Klasse „Lücke“ im Bericht).
 *
 * Ersetzt wird in zwei Fällen:
 *  A) Das Token hat hell und dunkel denselben Wert (z. B. --color-accent #df7a00).
 *  B) Für genau diesen Selektor und diese Eigenschaft gibt es eine Dunkel-Regel
 *     ([data-theme="dark"] <Selektor>), und ein Token hat hell den alten und dunkel genau
 *     den Wert dieser Regel. Die Dunkel-Regel bleibt stehen (sie gewinnt weiter per
 *     Spezifität); sie ist danach für diesen Selektor überflüssig und steht im Bericht.
 *     Entfernt wird sie hier nicht: Eine Dunkel-Regel kann auch Regeln anderer Selektoren
 *     überstimmen (Erkenntnis aus A5, .kueche-tile), das prüft nur ein Blick in die App.
 *
 * Nicht angefasst: Werte in url(...) und Strings, Custom Properties, Verläufe und Schatten
 * ohne passende Dunkel-Regel, `color` auf Klassen, die im JSX auf p, span, label oder li
 * stehen und schwächer als 0-1-1 sind (sonst schlägt darkTextPolicy.test.js an, A7).
 *
 * Aufruf:
 *   node scripts/colorTokenCodemod.js            Bericht (nichts wird geschrieben)
 *   node scripts/colorTokenCodemod.js --write    Ersetzungen schreiben
 *   node scripts/colorTokenCodemod.js --json f   Bericht zusätzlich als JSON nach f
 * Danach die Baselines in src/colorTokenPolicy.test.js senken (der Test nennt die Werte).
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const EXEMPT = new Set(['tokens.css', 'darkMode.css']);
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
const DARK_PREFIX = /^(?:html)?\[data-theme="dark"\]\s+/;

// Welche Tokens zu welcher Eigenschaft passen. Domänen-Tokens (Wichteln, Wein, Timer,
// Undo-Snackbar, Alarm) und Text-auf-Farbe-Tokens (on-*) werden nie automatisch vergeben.
const FAMILY_TOKENS = {
  text: ['text', 'text-strong', 'text-body', 'text-muted', 'text-soft', 'text-faint', 'brand', 'accent', 'events', 'ok', 'bad-text'],
  surface: ['surface', 'surface-card', 'surface-raised', 'surface-subtle', 'surface-input', 'bg', 'accent-tint', 'events-tint',
    'brand', 'accent', 'events', 'ok', 'bad'],
  line: ['border', 'border-subtle', 'border-strong', 'brand', 'accent', 'events', 'ok', 'bad'],
};
// Fall A: Tokens, die hell und dunkel gleich sind und deren Name zu jeder Verwendung passt.
const IDENTICAL_SAFE = { text: ['accent', 'ok'], surface: ['accent', 'ok', 'bad'], line: ['accent', 'ok', 'bad'] };

function family(prop) {
  if (prop === 'color' || prop === 'fill' || prop === 'stroke' || prop === 'caret-color' || prop === 'text-decoration-color') return 'text';
  if (prop === 'background' || prop === 'background-color') return 'surface';
  if (/^(border|outline)(-(top|right|bottom|left))?(-color)?$/.test(prop) || prop === 'border-color') return 'line';
  return null;
}

/** Dunkel-Eigenschaften, die den Farbanteil einer hellen Eigenschaft vollständig überschreiben. */
function coveringProps(prop, lightValue) {
  if (prop === 'background') {
    return /gradient|url\(/i.test(lightValue) ? ['background', 'background-image'] : ['background', 'background-color'];
  }
  if (prop === 'background-color') return ['background-color', 'background'];
  const side = /^(border|outline)-(top|right|bottom|left)/.exec(prop);
  if (side) return [`${side[1]}-${side[2]}-color`, `${side[1]}-${side[2]}`, `${side[1]}-color`, side[1]];
  const base = /^(border|outline)(-color)?$/.exec(prop);
  if (base) return [`${base[1]}-color`, base[1]];
  return [prop];
}

function normalizeColor(c) {
  const s = c.trim().toLowerCase().replace(/\s+/g, '');
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  if (s === '#ffffff' || s === 'white') return '#ffffff';
  return s;
}

function loadTokens(tokensCss) {
  const text = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const [lightBlock, darkBlock] = text.split(/\n\[data-theme="dark"\] \{/);
  const read = (block) => {
    const map = {};
    block.replace(/--color-([\w-]+)\s*:\s*([^;]+);/g, (m, name, value) => { map[name] = value.trim(); });
    return map;
  };
  const light = read(lightBlock);
  const dark = { ...light, ...read(darkBlock) };
  const resolve = (map, v) => v.replace(/var\(--color-([\w-]+)\)/g, (m, n) => map[n] || m);
  const tokens = {};
  Object.keys(light).forEach((name) => {
    if (/var\(/.test(light[name])) return; // Alias wie --color-focus-ring: nie automatisch vergeben
    tokens[name] = { light: normalizeColor(resolve(light, light[name])), dark: normalizeColor(resolve(dark, dark[name])) };
  });
  return { tokens, resolveDark: (v) => resolve(dark, v) };
}

/** Kommentare durch Leerzeichen ersetzen, damit Offsets stimmen. */
const blankComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

/** Bei Tiefe 0 an `sep` trennen (Klammern und Strings werden übersprungen). */
function splitTopLevel(text, sep, offset = 0) {
  const parts = [];
  let depth = 0; let quote = null; let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) { if (ch === quote && text[i - 1] !== '\\') quote = null; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === sep && depth === 0) { parts.push({ text: text.slice(start, i), start: offset + start }); start = i + 1; }
  }
  parts.push({ text: text.slice(start), start: offset + start });
  return parts;
}

/** Regeln mit Offsets: {selectors, media, decls: [{prop, value, valueStart, important}]} */
function parseCss(source) {
  const text = blankComments(source);
  const rules = [];
  (function walk(start, end, media, inKeyframes) {
    let i = start;
    while (i < end) {
      const open = text.indexOf('{', i);
      if (open < 0 || open >= end) break;
      const semi = text.lastIndexOf(';', open);
      const headStart = semi >= i ? semi + 1 : i;
      const head = text.slice(headStart, open).trim();
      let depth = 1; let j = open + 1;
      while (j < end && depth > 0) { if (text[j] === '{') depth += 1; else if (text[j] === '}') depth -= 1; j += 1; }
      const bodyStart = open + 1; const bodyEnd = j - 1;
      if (/^@(media|supports|container|layer)\b/.test(head)) walk(bodyStart, bodyEnd, media ? `${media} && ${head}` : head, false);
      else if (/^@(-webkit-)?keyframes\b/.test(head)) walk(bodyStart, bodyEnd, media, true);
      else if (!head.startsWith('@')) {
        const decls = splitTopLevel(text.slice(bodyStart, bodyEnd), ';', bodyStart).map((part) => {
          const colon = part.text.indexOf(':');
          if (colon < 0) return null;
          const prop = part.text.slice(0, colon).trim().toLowerCase();
          const rawValue = part.text.slice(colon + 1);
          return { prop, value: rawValue, valueStart: part.start + colon + 1, important: /!\s*important/i.test(rawValue) };
        }).filter(Boolean);
        const selectors = inKeyframes ? [] : splitTopLevel(head, ',').map((p) => p.text.trim().replace(/\s+/g, ' '));
        rules.push({ selectors, media: media || '', decls, keyframes: inKeyframes });
      }
      i = j;
    }
  }(0, text.length, '', false));
  return rules;
}

/** Positionen von url(...)-Ausdrücken und Strings in einem Wert. */
function protectedRanges(value) {
  const ranges = [];
  const re = /url\([^)]*\)|"[^"]*"|'[^']*'/gi;
  let m;
  while ((m = re.exec(value))) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

function colorLiterals(value) {
  const out = [];
  const ranges = protectedRanges(value);
  let m;
  const re = new RegExp(COLOR_LITERAL.source, 'g');
  while ((m = re.exec(value))) {
    if (ranges.some(([a, b]) => m.index >= a && m.index < b)) continue;
    out.push({ raw: m[0], index: m.index, hex: m[0].startsWith('#') });
  }
  return out;
}

const skeleton = (value) => value.replace(COLOR_LITERAL, '§').replace(/!\s*important/i, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Klassen, die im JSX auf p, span, label oder li stehen (wie src/darkTextPolicy.test.js). */
function textElementClasses() {
  let parse;
  try { ({ parse } = require('@babel/parser')); } catch (e) { return null; }
  const classes = new Set();
  const walkAst = (node, visit) => {
    if (!node || typeof node.type !== 'string') return;
    visit(node);
    Object.keys(node).forEach((key) => {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra') return;
      const value = node[key];
      if (Array.isArray(value)) value.forEach((child) => walkAst(child, visit));
      else if (value && typeof value.type === 'string') walkAst(value, visit);
    });
  };
  const jsFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === '__mocks__' ? [] : jsFiles(full);
    return /\.jsx?$/.test(e.name) && !/\.test\.jsx?$/.test(e.name) ? [full] : [];
  });
  jsFiles(SRC).forEach((file) => {
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes('className')) return;
    const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
    walkAst(ast.program, (node) => {
      if (node.type !== 'JSXOpeningElement' || node.name.type !== 'JSXIdentifier' || !['p', 'span', 'label', 'li'].includes(node.name.name)) return;
      const attr = node.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === 'className');
      if (!attr) return;
      const texts = [];
      walkAst(attr.value, (child) => {
        if (child.type === 'StringLiteral') texts.push(child.value);
        if (child.type === 'TemplateElement') texts.push(child.value.cooked || '');
      });
      texts.join(' ').split(/\s+/).filter((c) => /^[A-Za-z_-][\w-]*$/.test(c)).forEach((c) => classes.add(c));
    });
  });
  return classes;
}

/** Wie in darkTextPolicy.test.js: schwächer als [data-theme="dark"] span (0-1-1)? */
function weakTextSelector(selector, classes) {
  const parts = selector.trim().split(/\s+|>|\+|~/).filter(Boolean);
  const last = ((parts[parts.length - 1] || '').match(/\.[A-Za-z_-][\w-]*/g) || []).map((c) => c.slice(1));
  if (!last.some((c) => classes.has(c))) return false;
  const s = selector.replace(/::?(before|after|placeholder|marker|selection|first-line|first-letter)\b/g, '').replace(/:(where)\([^)]*\)/g, '');
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const cls = (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!not\b|is\b)[\w-]+(\([^)]*\))?/g) || []).length;
  const els = (s.replace(/\[[^\]]+\]|\([^)]*\)/g, '').match(/(^|[\s>+~(])([a-z][\w-]*)/gi) || []).length;
  return ids === 0 && (cls === 0 || (cls === 1 && els === 0));
}

function cssFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return cssFiles(full);
    return /\.css$/.test(e.name) ? [full] : [];
  });
}

/**
 * Reine Analyse ohne Dateizugriff (testbar): sources = [{rel, source}] aller CSS-Dateien außer tokens.css.
 * Liefert {report, outputs}: outputs[rel] ist der neue Dateiinhalt, wo etwas ersetzt wurde.
 */
function analyze({ sources, tokensCss, textClasses }) {
  const { tokens, resolveDark } = loadTokens(tokensCss);
  const parsed = sources.map((f) => ({ ...f, rules: parseCss(f.source) }));
  const jsxText = textClasses;
  const outputs = {};

  // Dunkel-Regeln je Selektor (aus allen CSS-Dateien): selector -> prop -> [{value, important, media}]
  const dark = new Map();
  parsed.forEach(({ rules }) => rules.forEach((rule) => {
    rule.selectors.forEach((sel) => {
      if (!DARK_PREFIX.test(sel)) return;
      const key = sel.replace(DARK_PREFIX, '');
      if (!dark.has(key)) dark.set(key, new Map());
      rule.decls.forEach((d) => {
        const list = dark.get(key).get(d.prop) || [];
        list.push({ value: resolveDark(d.value), important: d.important, media: rule.media });
        dark.get(key).set(d.prop, list);
      });
    });
  }));

  /** Dunkelwert für (Selektor, Eigenschaft) oder null, wenn nicht eindeutig oder nicht deckend. */
  function darkOverride(selector, prop, lightValue, lightImportant, media) {
    const props = dark.get(selector);
    if (!props) return null;
    const hits = coveringProps(prop, lightValue).flatMap((p) => (props.get(p) || []).map((h) => ({ ...h, prop: p })));
    if (hits.length === 0) return null;
    if (!hits.some((h) => h.media === '' || h.media === media)) return null;
    if (lightImportant && !hits.every((h) => h.important)) return null;
    const distinct = new Set(hits.map((h) => `${h.prop}:${skeleton(h.value)}|${colorLiterals(h.value).map((c) => normalizeColor(c.raw)).join(',')}`));
    if (distinct.size !== 1) return null;
    return hits[0];
  }

  const report = { replaced: [], redundantDark: [], gap: {}, missingToken: {}, perFile: {} };
  const bump = (obj, key, n = 1) => { obj[key] = (obj[key] || 0) + n; };

  parsed.forEach((f) => {
    if (EXEMPT.has(path.basename(f.rel))) return;
    const edits = [];
    f.rules.forEach((rule) => {
      if (rule.selectors.some((s) => /data-theme/.test(s))) return; // Dunkel-Regeln selbst bleiben unberührt
      rule.decls.forEach((d) => {
        const lits = colorLiterals(d.value);
        if (!lits.some((l) => l.hex)) return;
        const fam = family(d.prop);
        if (!fam || d.prop.startsWith('--')) { lits.filter((l) => l.hex).forEach(() => bump(report.gap, `${f.rel} (nicht unterstützte Eigenschaft ${d.prop})`)); return; }
        const textGuard = fam === 'text' && rule.selectors.some((s) => weakTextSelector(s, jsxText));

        // Dunkelwerte je Literal: nur wenn jeder Selektor der Regel dieselbe deckende Dunkel-Regel hat
        let darkValues = null;
        if (!rule.keyframes && rule.selectors.length > 0) {
          const per = rule.selectors.map((s) => darkOverride(s, d.prop, d.value, d.important, rule.media));
          if (per.every(Boolean)) {
            const ref = per[0];
            const same = per.every((p) => skeleton(p.value) === skeleton(ref.value) && p.value.trim() === ref.value.trim());
            if (same) {
              const darkLits = colorLiterals(ref.value);
              if (darkLits.length === lits.length && skeleton(ref.value) === skeleton(d.value)) darkValues = darkLits.map((l) => normalizeColor(l.raw));
              else if (darkLits.length === 1 && lits.length === 1 && /-color$/.test(ref.prop)) darkValues = [normalizeColor(darkLits[0].raw)];
            }
          }
        }

        lits.forEach((lit, idx) => {
          if (!lit.hex) return;
          const light = normalizeColor(lit.raw);
          let token = null; let kind = null;
          if (!textGuard) {
            token = IDENTICAL_SAFE[fam].find((t) => tokens[t] && tokens[t].light === light && tokens[t].dark === light) || null;
            if (token) kind = 'A';
            if (!token && darkValues) {
              token = FAMILY_TOKENS[fam].find((t) => tokens[t] && tokens[t].light === light && tokens[t].dark === darkValues[idx]) || null;
              if (token) kind = 'B';
            }
          }
          if (token) {
            edits.push({ at: d.valueStart + lit.index, len: lit.raw.length, text: `var(--color-${token})` });
            report.replaced.push({ file: f.rel, selector: rule.selectors.join(', '), prop: d.prop, from: lit.raw, token, kind });
            if (kind === 'B') report.redundantDark.push({ file: f.rel, selector: rule.selectors.join(', '), prop: d.prop, token });
            bump(report.perFile, f.rel);
          } else if (textGuard) {
            bump(report.gap, 'Textfarbe auf p/span/label/li unter 0-1-1 (A7, erst Selektor verstärken)');
          } else if (darkValues) {
            bump(report.missingToken, `${fam}: ${light} / dunkel ${darkValues[idx]}`);
          } else {
            const known = Object.keys(tokens).some((t) => tokens[t].light === light);
            bump(report.gap, known ? 'Lücke: Token vorhanden, aber keine Dunkel-Regel (Dunkelmodus zeigt heute den hellen Wert)' : 'Lücke: weder Token noch Dunkel-Regel');
          }
        });
      });
    });
    if (edits.length > 0) {
      let out = f.source;
      edits.sort((a, b) => b.at - a.at).forEach((e) => { out = out.slice(0, e.at) + e.text + out.slice(e.at + e.len); });
      outputs[f.rel] = out;
    }
  });
  return { report, outputs };
}

function run({ write }) {
  const textClasses = textElementClasses();
  if (!textClasses) throw new Error('@babel/parser fehlt: erst npm ci ausführen');
  const sources = cssFiles(SRC)
    .filter((file) => path.basename(file) !== 'tokens.css')
    .map((file) => ({ rel: path.relative(SRC, file).split(path.sep).join('/'), source: fs.readFileSync(file, 'utf8') }));
  const tokensCss = fs.readFileSync(path.join(SRC, 'tokens.css'), 'utf8');
  const { report, outputs } = analyze({ sources, tokensCss, textClasses });
  if (write) Object.entries(outputs).forEach(([rel, out]) => fs.writeFileSync(path.join(SRC, rel), out));
  return report;
}

if (require.main === module) {
  const write = process.argv.includes('--write');
  const jsonIdx = process.argv.indexOf('--json');
  const report = run({ write });
  const byKind = report.replaced.reduce((acc, r) => { acc[r.kind] = (acc[r.kind] || 0) + 1; return acc; }, {});
  const byToken = report.replaced.reduce((acc, r) => { acc[r.token] = (acc[r.token] || 0) + 1; return acc; }, {});
  console.log(`${write ? 'Ersetzt' : 'Ersetzbar'}: ${report.replaced.length} Hex-Farben in ${Object.keys(report.perFile).length} Dateien`
    + ` (A: Token hell = dunkel ${byKind.A || 0}, B: passende Dunkel-Regel ${byKind.B || 0})`);
  console.log('Je Token:', Object.entries(byToken).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(', '));
  console.log('Nicht ersetzt:');
  Object.entries(report.gap).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([k, n]) => console.log(`  ${n}  ${k}`));
  const missing = Object.entries(report.missingToken).sort((a, b) => b[1] - a[1]);
  console.log(`  ${missing.reduce((s, [, n]) => s + n, 0)}  Dunkel-Regel vorhanden, aber kein Token mit diesem Wertepaar; häufigste Paare:`);
  missing.slice(0, 10).forEach(([k, n]) => console.log(`       ${n}  ${k}`));
  if (jsonIdx > 0) fs.writeFileSync(process.argv[jsonIdx + 1], JSON.stringify(report, null, 2));
}

module.exports = { analyze, parseCss, colorLiterals, normalizeColor, coveringProps, run };
