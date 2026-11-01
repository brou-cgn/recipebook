import fs from 'fs';
import path from 'path';

// Karussell der Kochsitzung im iPad-Querformat (Vorhaben „Parallel kochen“, Entwurf I4).
const readCss = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const getRuleBody = (css, selector) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\})\\s*${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  return match ? match[1] : '';
};

describe('CookingSessionCarousel CSS', () => {
  const carouselCss = readCss('CookingSessionCarousel.css');
  const recipeDetailCss = readCss('RecipeDetail.css');
  const tokensCss = readCss('../tokens.css');
  const lightTokens = getRuleBody(tokensCss, ':root');
  const darkTokens = getRuleBody(tokensCss, '[data-theme="dark"]');

  test('nutzt nur Farb-Tokens, die tokens.css für Light und Dark definiert', () => {
    const used = [...new Set([...carouselCss.matchAll(/var\((--color-[a-z-]+)/g)].map((m) => m[1]))];
    const missing = used.filter((token) => !lightTokens.includes(`${token}:`) || !darkTokens.includes(`${token}:`));

    expect(used.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
    expect(carouselCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  test('scrollt senkrecht und rastet je Karte ein', () => {
    const list = getRuleBody(carouselCss, '.cooking-carousel-list');
    expect(list).toContain('overflow-y: auto;');
    expect(list).toContain('scroll-snap-type: y mandatory;');
    expect(getRuleBody(carouselCss, '.cooking-carousel-item')).toContain('scroll-snap-align: start;');
  });

  test('bis zu zwei Karten teilen sich die Höhe, ab drei passen drei ganz und die vierte schaut heraus', () => {
    expect(getRuleBody(carouselCss, '.cooking-carousel-item')).toContain('flex: 0 0 calc((100% - 12px) / 2);');
    expect(getRuleBody(carouselCss, '.cooking-carousel--compact .cooking-carousel-item'))
      .toContain('flex-basis: calc((100% - 3 * 12px) / 3.25);');
    expect(getRuleBody(carouselCss, '.cooking-carousel--compact .cooking-carousel-step')).toContain('-webkit-line-clamp: 3;');
  });

  test('die rote Fläche zum Entfernen erscheint nach dem Linksswipe und ist antippbar; in Ruhe deckt die Karte sie ab', () => {
    const body = getRuleBody(carouselCss, '.cooking-carousel-item.swipe-delete-active .swipe-delete-background');
    expect(body).toContain('opacity: 1;');
    expect(body).toContain('pointer-events: auto;');
    expect(getRuleBody(carouselCss, '.cooking-carousel-card')).toContain('background: var(--color-surface-card);');
  });

  test('bald fällig und abgelaufen: orange wie in Leiste und Schiene', () => {
    expect(getRuleBody(carouselCss, '.cooking-carousel-item--urgent .cooking-carousel-status'))
      .toContain('background: var(--color-accent);');
    expect(getRuleBody(carouselCss, '.cooking-carousel-item--urgent .cooking-carousel-card'))
      .toContain('border-color: var(--color-accent);');
  });

  describe('Lage im Kochmodus (RecipeDetail.css, cooking-mode-split)', () => {
    test('zwei Spalten über den ganzen Bildschirm: links das Karussell über alle Zeilen', () => {
      const split = getRuleBody(recipeDetailCss, '.recipe-detail-content.cooking-mode-active.cooking-mode-split');
      expect(split).toContain('position: fixed;');
      expect(split).toContain('display: grid;');
      expect(split).toContain('grid-template-columns: var(--cooking-carousel-width) minmax(0, 1fr);');

      const left = getRuleBody(recipeDetailCss, '.cooking-mode-split .cooking-carousel');
      expect(left).toContain('grid-column: 1;');
      expect(left).toContain('grid-row: 1 / -1;');
    });

    test('rechts der Kochmodus wie im Hochformat: Titelzeile, Fortschritt, Schritte, Zutaten-Sheet', () => {
      const placement = ['.cooking-mode-titlebar', '.step-dots', '.step-carousel', '.cooking-mode-ingredients']
        .map((part) => getRuleBody(recipeDetailCss, `.cooking-mode-split ${part}`));
      placement.forEach((body, index) => {
        expect(body).toContain('grid-column: 2;');
        expect(body).toContain(`grid-row: ${index + 1};`);
      });
    });

    test('die Schrittkarte richtet sich nach der Spalte, nicht nach dem Bildschirm', () => {
      const card = getRuleBody(recipeDetailCss, '.cooking-mode-split .step-card');
      expect(card).toContain('width: 100%;');
      expect(card).toContain('max-width: none;');
      // Grundregel: 100vw, höchstens 398 px (Handy)
      expect(getRuleBody(recipeDetailCss, '.step-card')).toContain('max-width: 398px;');
    });
  });
});
