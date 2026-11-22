import fs from 'fs';
import path from 'path';

// „Chefkoch & mehr“ auf dem Handy: Die Kachelknöpfe dürfen keine Tipp-Hervorhebung zeigen
// (iOS legte eine graue Fläche über den Titel, die nach dem Wechsel auf die Unterseite stehen
// blieb), und das Anheben beim Hover gilt nur für Geräte mit Maus.
const css = fs.readFileSync(path.join(__dirname, 'Kueche.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const normalize = (text) => text.replace(/\s+/g, ' ').trim();
const ruleBody = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|[\\s}])${escaped}\\s*\\{([^}]*)\\}`));
  return match ? normalize(match[1]) : '';
};

describe('Kueche.css: Kacheln auf dem Handy', () => {
  it('schaltet die Tipp-Hervorhebung des Kachelknopfs ab', () => {
    expect(ruleBody('.kueche-tile .kueche-tile__knopf')).toContain('-webkit-tap-highlight-color: transparent');
  });

  it('hebt die Kachel nur bei Geräten mit Maus an', () => {
    expect(css).toMatch(/@media \(hover: hover\)\s*\{\s*\.kueche-tile:hover\s*\{/);
    expect(css.replace(/@media \(hover: hover\)\s*\{\s*\.kueche-tile:hover\s*\{[^}]*\}\s*\}/, ''))
      .not.toMatch(/(^|[\s}])\.kueche-tile:hover\s*\{\s*transform: translateY/);
  });

  it('gibt beim Tippen eine kurze Rückmeldung', () => {
    expect(ruleBody('.kueche-tile:active')).toContain('transform: scale(0.98)');
  });
});
