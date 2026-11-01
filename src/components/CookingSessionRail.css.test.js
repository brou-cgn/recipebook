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

  test('„+“ bleibt in der Schiene 44 px und deckend, auch auf schmalen Handys im Querformat', () => {
    const body = getRuleBody(railCss, '.cooking-rail .cooking-mode-add-recipe');
    expect(body).toContain('width: 44px;');
    expect(body).toContain('height: 44px;');
    expect(body).toContain('opacity: 1;');
  });

  test('ab vier Rezepten werden Kreise und „+“ kleiner', () => {
    expect(getRuleBody(railCss, '.cooking-rail--compact .cooking-rail-thumb')).toContain('width: 30px;');
    expect(getRuleBody(railCss, '.cooking-rail--compact .cooking-mode-add-recipe')).toContain('width: 40px;');
  });
});
