/**
 * Guards against "CSS from a foreign lazy chunk" bugs.
 *
 * Views like RecipeDetail, MenuDetail or GroupDetail are loaded via
 * React.lazy(), and their CSS is only injected once the chunk is loaded.
 * If view A uses a class whose base rule lives only in view B's stylesheet,
 * A renders unstyled until B has been opened once in the session — e.g. the
 * delete FAB of private lists showed its icon at full image size after an
 * app restart.
 *
 * For every lazy entry point this test walks its static import graph and
 * checks that each class used in a static className is defined by a base
 * rule (single-class, single-compound selector like `.foo` or `.foo:hover`)
 * in a stylesheet that is guaranteed to be loaded: the eager bundle or the
 * entry point's own import graph. A class that is only defined in some other
 * chunk's stylesheet is reported.
 *
 * Fix a finding by moving the shared rules into their own stylesheet that
 * every user imports itself (see DeleteFabButton.css, PortionSelector.css),
 * or by styling the element with the component's own classes.
 *
 * Limits: only string literals in className are checked; classes built at
 * runtime are not visible to this test.
 */
import fs from 'fs';
import path from 'path';

const SRC = __dirname;

// Known hits that are fine because the component styles the class itself
// (scoped/descendant rule in its own stylesheet). The foreign base rule only
// adds nuances once the other chunk is loaded. Key: "<file>::<class>".
// Add entries only with a reason; stale entries make the test fail.
const ALLOWED = {
  'components/AppCallsPage.js::edit-btn': 'styled via .list-item .edit-btn in Settings.css',
  'components/EventsPage.js::edit-fab-button': 'styled via .events-edit-fab-button in EventsPage.css',
  'components/GroupCreateDialog.js::group-member-list': 'styled via .group-dialog .group-member-list in GroupCreateDialog.css',
  'components/MenuForm.js::button-icon-img': 'sized via .menu-photo-upload-icon-img in MenuForm.css',
  'components/MenuForm.js::drag-handle': 'styled via .menu-form-container .drag-handle in MenuForm.css',
  'components/MenuForm.js::section-header': 'styled via .menu-form-container .section-header in MenuForm.css',
  'components/PasswordChangeModal.js::error-message': 'styled via .password-change-modal .error-message',
  'components/PasswordChangeModal.js::form-group': 'styled via .password-change-modal .form-group',
  'components/PasswordChangeModal.js::submit-btn': 'styled via .password-change-modal .submit-btn',
  'components/Settings.js::drag-handle': 'styled via .list-item .drag-handle in Settings.css',
};

const resolveImport = (fromFile, spec) => {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base, `${base}.js`, `${base}.jsx`, path.join(base, 'index.js')];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) || null;
};

const isScript = (file) => /\.jsx?$/.test(file);
const isTest = (file) => /\.test\.jsx?$/.test(file) || file.includes(`${path.sep}__mocks__${path.sep}`);

const parseImports = (file) => {
  const source = fs.readFileSync(file, 'utf8');
  const lazy = [];
  const withoutDynamic = source.replace(/import\(\s*['"]([^'"]+)['"]\s*\)/g, (match, spec) => {
    lazy.push(spec);
    return '';
  });
  const staticSpecs = [];
  for (const m of withoutDynamic.matchAll(/(?:import\s+(?:[^'"]*?from\s+)?|require\()\s*['"]([^'"]+)['"]/g)) {
    staticSpecs.push(m[1]);
  }
  const resolveAll = (specs) => specs.map((s) => resolveImport(file, s)).filter(Boolean);
  return { staticDeps: resolveAll(staticSpecs), lazyDeps: resolveAll(lazy) };
};

const walk = (entries) => {
  const seen = new Set();
  const lazyRoots = new Set();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!isScript(file)) continue;
    const { staticDeps, lazyDeps } = parseImports(file);
    staticDeps.forEach((d) => queue.push(d));
    lazyDeps.forEach((d) => lazyRoots.add(d));
  }
  return { seen, lazyRoots };
};

const baseClassesCache = new Map();
const baseClasses = (cssFile) => {
  if (baseClassesCache.has(cssFile)) return baseClassesCache.get(cssFile);
  const css = fs.readFileSync(cssFile, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const classes = new Set();
  for (const rule of css.matchAll(/([^{}@;]+)\{/g)) {
    for (let selector of rule[1].split(',')) {
      selector = selector.trim().replace(/\([^)]*\)/g, '');
      if (!selector || /[\s>+~]/.test(selector)) continue;
      const found = [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
      if (found.length === 1) classes.add(found[0]);
    }
  }
  baseClassesCache.set(cssFile, classes);
  return classes;
};

const usedClasses = (jsFile) => {
  const source = fs.readFileSync(jsFile, 'utf8');
  const used = new Set();
  for (const m of source.matchAll(/className=\{?\s*(?:`([^`]*)`|"([^"]*)"|'([^']*)')/g)) {
    const raw = m[1] || m[2] || m[3] || '';
    raw.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).forEach((c) => c && used.add(c));
    for (const q of raw.matchAll(/'([\w\- ]+)'/g)) q[1].split(/\s+/).forEach((c) => c && used.add(c));
  }
  return used;
};

const findForeignChunkClasses = () => {
  const eager = walk([path.join(SRC, 'index.js')]);
  const eagerCss = [...eager.seen].filter((f) => f.endsWith('.css'));

  const roots = new Set(eager.lazyRoots);
  let grew = true;
  while (grew) {
    grew = false;
    for (const root of [...roots]) {
      for (const nested of walk([root]).lazyRoots) {
        if (!roots.has(nested)) {
          roots.add(nested);
          grew = true;
        }
      }
    }
  }

  const closures = new Map([...roots].map((r) => [r, walk([r]).seen]));
  const allCss = new Set(eagerCss);
  closures.forEach((files) => files.forEach((f) => f.endsWith('.css') && allCss.add(f)));

  const hits = new Map();
  for (const [, files] of closures) {
    const available = new Set();
    [...eagerCss, ...[...files].filter((f) => f.endsWith('.css'))]
      .forEach((f) => baseClasses(f).forEach((c) => available.add(c)));

    for (const file of files) {
      if (!isScript(file) || isTest(file) || eager.seen.has(file)) continue;
      for (const cls of usedClasses(file)) {
        if (available.has(cls)) continue;
        const definedIn = [...allCss].filter((css) => baseClasses(css).has(cls));
        if (definedIn.length === 0) continue;
        const key = `${path.relative(SRC, file).split(path.sep).join('/')}::${cls}`;
        hits.set(key, definedIn.map((css) => path.relative(SRC, css).split(path.sep).join('/')));
      }
    }
  }
  return hits;
};

describe('CSS chunk isolation', () => {
  const hits = findForeignChunkClasses();

  it('lazy views do not depend on base styles from another lazy chunk', () => {
    const unexpected = [...hits]
      .filter(([key]) => !ALLOWED[key])
      .map(([key, files]) => `${key} -> only defined in ${files.join(', ')}`);
    expect(unexpected).toEqual([]);
  });

  it('allow-list has no stale entries', () => {
    const stale = Object.keys(ALLOWED).filter((key) => !hits.has(key));
    expect(stale).toEqual([]);
  });

  it('detects the pattern (GroupDetail uses delete FAB and portion selector)', () => {
    // Sanity check that the graph walk reaches lazy views at all: these
    // classes must resolve via the shared stylesheets, not be invisible.
    const groupDetailCss = walk([path.join(SRC, 'components', 'GroupDetail.js')]).seen;
    const names = [...groupDetailCss].map((f) => path.basename(f));
    expect(names).toEqual(expect.arrayContaining(['DeleteFabButton.css', 'PortionSelector.css']));
  });
});
