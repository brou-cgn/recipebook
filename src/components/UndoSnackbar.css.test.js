import fs from 'fs';
import path from 'path';

// Der Hinweis „… entfernt · Rückgängig“ schwebt unten in der Mitte. Am Handy liegt dort die untere
// Navigation auf derselben Ebene (z-index 1200) und wird später gezeichnet: Ohne ihren Versatz
// verschwand der Hinweis dahinter, „Rückgängig“ ließ sich weder lesen noch antippen (aufgefallen am
// 25.11.2026 beim Entfernen eines Druckformats, betraf alle Bereiche mit unterer Navigation).
describe('UndoSnackbar CSS', () => {
  const read = (...parts) => fs.readFileSync(path.join(__dirname, ...parts), 'utf8');
  const css = read('UndoSnackbar.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = css.match(/\.undo-snackbar\s*\{([\s\S]*?)\}/)[1];
  const bottom = rule.match(/bottom:\s*([^;]+);/)[1];

  test('steht über der unteren Navigation und über der Rezeptleiste des Kochmodus', () => {
    expect(bottom).toContain('var(--bottom-nav-offset, 0px)');
    expect(bottom).toContain('var(--cooking-dock-offset, 0px)');
  });

  test('die beiden Versätze gibt es unter diesen Namen: App.js und CookingSessionDock.js setzen sie', () => {
    expect(read('..', 'App.js')).toContain("'--bottom-nav-offset'");
    expect(read('CookingSessionDock.js')).toContain("'--cooking-dock-offset'");
  });
});
