/**
 * Erzwingt die Regel "Neue Collections brauchen Regeln in firestore.rules und einen
 * Eintrag in docs/architecture/security.md" (AGENTS.md). Ohne Test fehlten am
 * 30.10.2026 drei Collections in der Tabelle (Tech-Check D5).
 *
 * Für jeden match-Block zählt das letzte feste Pfadsegment (ohne {Platzhalter}):
 * aus firestore.rules muss es in einem `Code`-Abschnitt von security.md stehen
 * (allein oder als Teil eines Pfads), aus storage.rules als "Storage `name/".
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Rahmenblöcke der Regeldateien, keine Collections oder Ordner
const FRAME = new Set(['documents', 'o']);

const matchNames = (rules) => [...rules.matchAll(/^\s*match\s+(\/\S+)\s*\{/gm)]
  .map(([, matchPath]) => matchPath.split('/').filter((seg) => seg && !seg.startsWith('{')))
  .filter((segs) => segs.length > 0)
  .map((segs) => segs[segs.length - 1])
  .filter((name) => !FRAME.has(name));

describe('security.md beschreibt alle Regeln', () => {
  const doc = read('docs/architecture/security.md');
  const codeSegments = new Set(
    (doc.match(/`[^`]+`/g) || []).flatMap((span) => span.slice(1, -1).split(/[^\w-]+/).filter(Boolean))
  );

  it('nennt jede Collection aus firestore.rules', () => {
    const missing = [...new Set(matchNames(read('firestore.rules')))]
      .filter((name) => !codeSegments.has(name))
      .map((name) => `${name} (firestore.rules) fehlt in docs/architecture/security.md`);
    expect(missing).toEqual([]);
  });

  it('nennt jeden Storage-Ordner aus storage.rules', () => {
    const missing = [...new Set(matchNames(read('storage.rules')))]
      .filter((name) => !doc.includes(`Storage \`${name}/`))
      .map((name) => `Storage ${name}/ (storage.rules) fehlt in docs/architecture/security.md`);
    expect(missing).toEqual([]);
  });

  it('findet die bekannten Blöcke (Selbsttest des Parsers)', () => {
    const names = matchNames(read('firestore.rules'));
    expect(names).toEqual(expect.arrayContaining(['recipes', 'ratings', 'aiPromptHistory', 'customDrinks']));
    expect(matchNames(read('storage.rules'))).toEqual(expect.arrayContaining(['drinks', 'thumbnails']));
  });
});
