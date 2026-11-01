import fs from 'fs';
import path from 'path';

// Rezept-Schiene der Kochsitzung im Querformat (Vorhaben „Parallel kochen“, Entwurf Q2).
const readCss = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const getRuleBody = (css, selector) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\})\\s*${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  return match ? match[1] : '';
};

describe('CookingSessionRail CSS', () => {
  const railCss = readCss('CookingSessionRail.css');
  const tokensCss = readCss('../tokens.css');
  const lightTokens = getRuleBody(tokensCss, ':root');
  const darkTokens = getRuleBody(tokensCss, '[data-theme="dark"]');

  test('nutzt nur Farb-Tokens, die tokens.css für Light und Dark definiert', () => {
    const used = [...new Set([...railCss.matchAll(/var\((--color-[a-z-]+)/g)].map((m) => m[1]))];
    const missing = used.filter((token) => !lightTokens.includes(`${token}:`) || !darkTokens.includes(`${token}:`));

    expect(used.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
    expect(railCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  test('die Lasche des Rezepts vorn hat in Light und Dark die Farbe der Zutatenspalte', () => {
    expect(getRuleBody(railCss, '.cooking-rail-item--current .cooking-rail-button'))
      .toContain('background: var(--color-surface-card);');

    // Zutatenspalte: Light weiß (RecipeDetail.css), Dark aus darkMode.css
    const recipeDetailCss = readCss('RecipeDetail.css');
    const darkModeCss = readCss('../darkMode.css');
    expect(lightTokens).toMatch(/--color-surface-card:\s*#fff;/);
    expect(getRuleBody(recipeDetailCss, '.cooking-mode-ingredients')).toContain('background: white;');
    const darkSurfaceCard = darkTokens.match(/--color-surface-card:\s*(#[0-9a-fA-F]+);/)[1];
    expect(getRuleBody(darkModeCss, '[data-theme="dark"] .cooking-mode-ingredients'))
      .toContain(`background: ${darkSurfaceCard};`);
  });

  test('die rote Fläche zum Entfernen erscheint nach dem Linksswipe und ist antippbar', () => {
    const body = getRuleBody(railCss, '.cooking-rail-item.swipe-delete-active .swipe-delete-background');
    expect(body).toContain('opacity: 1;');
    expect(body).toContain('pointer-events: auto;');
    // In Ruhe deckt der Knopf sie ab
    expect(getRuleBody(railCss, '.cooking-rail-button')).toContain('background: var(--color-bg);');
  });

  test('Kreise und „+“ sind so groß wie die FAB-Buttons mobil, „+“ deckend und unabhängig von der Breite', () => {
    // Größe der FABs mobil: Regel bis 768 px Breite in CookingAddRecipeButton.css (wie .edit-fab-button)
    const fabCss = readCss('CookingAddRecipeButton.css');
    const fabMobile = fabCss.match(/@media \(max-width: 768px\)\s*\{\s*\.cooking-mode-add-recipe\s*\{([\s\S]*?)\}/)[1];
    const fabSize = fabMobile.match(/width:\s*(\d+px);/)[1];
    expect(fabSize).toBe('56px');

    const thumb = getRuleBody(railCss, '.cooking-rail-thumb');
    expect(thumb).toContain(`width: ${fabSize};`);
    expect(thumb).toContain(`height: ${fabSize};`);

    // Fest gesetzt: Mit viewport-fit=cover ist ein Handy quer breiter als 768 px, die FAB-Regel griffe nicht
    const add = getRuleBody(railCss, '.cooking-rail .cooking-mode-add-recipe');
    expect(add).toContain(`width: ${fabSize};`);
    expect(add).toContain(`height: ${fabSize};`);
    expect(add).toContain('opacity: 1;');

    // Keine kleinere Stufe mehr bei vielen Rezepten: dann scrollt die Liste
    expect(railCss).not.toMatch(/compact/);
  });

  test('die Liste scrollt als Karussell und rastet je Rezept ein; „+“ bleibt darunter stehen', () => {
    const list = getRuleBody(railCss, '.cooking-rail-list');
    expect(list).toContain('overflow-y: auto;');
    expect(list).toContain('scroll-snap-type: y mandatory;');
    expect(getRuleBody(railCss, '.cooking-rail-item')).toContain('scroll-snap-align: start;');
    expect(getRuleBody(railCss, '.cooking-rail-add')).toContain('flex-shrink: 0;');
  });

  test('rechts steht sie hinter Zutaten und Schritten, gespiegelt: zum Displayrand rund', () => {
    const right = getRuleBody(railCss, '.cooking-rail--right');
    expect(right).toContain('order: 1;');
    expect(right).toContain('padding-left: 0;');
    expect(getRuleBody(railCss, '.cooking-rail-item')).toContain('border-radius: 18px 0 0 18px;');
    expect(getRuleBody(railCss, '.cooking-rail--right .cooking-rail-item,\n.cooking-rail--right .cooking-rail-button'))
      .toContain('border-radius: 0 18px 18px 0;');
  });

  test('unten hält sie die Home-Leiste frei, an der Seite reicht sie bis an den Rand', () => {
    const rail = getRuleBody(railCss, '.cooking-rail');
    expect(rail).toContain('padding: 10px 0 max(12px, env(safe-area-inset-bottom, 0px)) 6px;');
    expect(railCss).not.toMatch(/safe-area-inset-(left|right)/);
  });

  test('der Hinweis auf ein fälliges Rezept außer Sicht ist orange wie „bald fällig“', () => {
    const jump = getRuleBody(railCss, '.cooking-rail-jump');
    expect(jump).toContain('background: var(--color-accent);');
    expect(jump).toContain('color: var(--color-on-accent);');
    expect(getRuleBody(railCss, '.cooking-rail-jump--up')).toContain('top: 10px;');
  });
});
