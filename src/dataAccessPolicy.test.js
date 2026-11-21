/**
 * Erzwingt die Regel "Nie eine ganze Collection lesen. Abfragen immer mit where und
 * limit" (AGENTS.md, Datenzugriff; Tech-Check K3 und W3). Grund: Jede Lese-Abfrage ohne
 * Grenze wächst mit dem Bestand; der Rezept-Listener ohne Filter war der größte Posten
 * der Firestore-Lesevorgänge (K1).
 *
 * Gezählt wird im Produktivcode unter src/ (ohne Tests):
 *  - Lesen einer ganzen Collection: getDocs/onSnapshot (auch FromServer/FromCache) direkt
 *    auf collection(...) bzw. collectionGroup(...) oder auf eine Variable, die genau das
 *    hält (const ref = collection(db, 'x')). Auch Unter-Collections eines Dokuments.
 *  - query(...) ohne limit(...) bzw. limitToLast(...) unter den Bedingungen. Eine
 *    Abfrage mit ...Spread zählt nicht (die Bedingungen sind hier nicht sichtbar).
 * Zählabfragen (getCountFromServer) lesen keine Dokumente und zählen nicht. Ein where
 * ohne limit zählt mit: es begrenzt nur, was passt, nicht wie viel.
 *
 * Bestehende Funde stehen als Baseline: je Datei die erlaubte Anzahl. Die Baseline darf
 * nur sinken; wer eine Abfrage begrenzt, senkt den Wert. Neue Dateien starten bei 0.
 */
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');

const SRC = __dirname;

// Stand 20.11.2026 (Tech-Check K3/W3).
const BASELINE = {
  'contexts/NutritionReferenceContext.js': 1,
  'utils/categoryImages.js': 1,
  'utils/cuisineProposalsFirestore.js': 1,
  'utils/customLists.js': 2,
  'utils/discoverTopics.js': 1,
  'utils/drinkWeightsFirestore.js': 2,
  'utils/eventsFirestore.js': 8,
  'utils/faqFirestore.js': 1,
  'utils/groupFirestore.js': 4,
  'utils/menuFirestore.js': 3,
  'utils/recipeCallsFirestore.js': 1,
  'utils/recipeCookDates.js': 3,
  'utils/recipeFirestore.js': 6,
  'utils/recipeRatings.js': 2,
  'utils/recipeSwipeFlags.js': 8,
  'utils/seasonMatrix.js': 2,
  'utils/tutorialsFirestore.js': 1,
  'utils/userManagement.js': 3,
};

const READS = new Set(['getDocs', 'onSnapshot', 'getDocsFromServer', 'getDocsFromCache']);
const COLLECTIONS = new Set(['collection', 'collectionGroup']);
const LIMITS = new Set(['limit', 'limitToLast']);

const calleeName = (node) =>
  node && node.type === 'CallExpression' && node.callee.type === 'Identifier' ? node.callee.name : null;

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

/** Unbegrenzte Lesezugriffe in einem Quelltext, je Fund mit Zeile. */
function unboundedReads(source) {
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const collectionVars = new Set();
  walk(ast.program, (node) => {
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && COLLECTIONS.has(calleeName(node.init))) {
      collectionVars.add(node.id.name);
    }
  });
  const isCollection = (arg) =>
    COLLECTIONS.has(calleeName(arg)) || (arg && arg.type === 'Identifier' && collectionVars.has(arg.name));
  const found = [];
  walk(ast.program, (node) => {
    if (node.type !== 'CallExpression') return;
    const name = calleeName(node);
    if (READS.has(name) && isCollection(node.arguments[0])) {
      found.push(`Zeile ${node.loc.start.line}: ${name} liest eine ganze Collection`);
    }
    if (name === 'query' && !node.arguments.some((arg) => arg.type === 'SpreadElement' || LIMITS.has(calleeName(arg)))) {
      found.push(`Zeile ${node.loc.start.line}: query ohne limit`);
    }
  });
  return found;
}

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' || entry.name === '__mocks__' ? [] : sourceFiles(full);
    return /\.jsx?$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('Datenzugriff-Richtlinie (where und limit)', () => {
  const found = {};
  sourceFiles(SRC).forEach((file) => {
    const source = fs.readFileSync(file, 'utf8');
    if (!/getDocs|onSnapshot|query\(/.test(source)) return;
    const reads = unboundedReads(source);
    if (reads.length > 0) found[path.relative(SRC, file).split(path.sep).join('/')] = reads;
  });

  it('führt keine neuen unbegrenzten Lesezugriffe ein und erhöht keine Baseline', () => {
    const violations = Object.entries(found)
      .filter(([file, reads]) => reads.length > (BASELINE[file] || 0))
      .map(([file, reads]) =>
        `${file}: ${reads.length} unbegrenzte Lesezugriffe (erlaubt: ${BASELINE[file] || 0}); ` +
        `Abfrage mit where und limit bauen – ${reads.join(', ')}`);
    expect(violations).toEqual([]);
  });

  it('hält die Baseline aktuell (begrenzte Abfragen senken den Wert)', () => {
    const stale = Object.entries(BASELINE)
      .filter(([file, n]) => (found[file] || []).length < n)
      .map(([file, n]) => `${file}: Baseline ${n}, tatsächlich ${(found[file] || []).length}`);
    expect(stale).toEqual([]);
  });

  it('erkennt ganze Collections (auch über eine Variable) und query ohne limit', () => {
    const src = `
      import { collection, collectionGroup, getDocs, onSnapshot, query, where, limit, orderBy, getCountFromServer } from 'firebase/firestore';
      const ref = collection(db, 'recipes');
      onSnapshot(ref, () => {});
      getDocs(collection(db, 'recipes', id, 'ratings'));
      getDocs(collectionGroup(db, 'teilnehmer'));
      getDocs(query(collection(db, 'x'), where('a', '==', 1)));
      getDocs(query(collection(db, 'x'), where('a', '==', 1), limit(20)));
      getDocs(query(collection(db, 'x'), orderBy('t'), limit(5)));
      getDocs(query(collection(db, 'x'), ...bedingungen));
      getCountFromServer(collection(db, 'x'));
      getDocs(doc(db, 'x', 'y'));
    `;
    expect(unboundedReads(src)).toEqual([
      'Zeile 4: onSnapshot liest eine ganze Collection',
      'Zeile 5: getDocs liest eine ganze Collection',
      'Zeile 6: getDocs liest eine ganze Collection',
      'Zeile 7: query ohne limit',
    ]);
  });
});
