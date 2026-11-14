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

  test('bis zu zwei Karten teilen sich die Höhe, kompakt ohne fill passen drei ganz und die vierte schaut heraus', () => {
    expect(getRuleBody(carouselCss, '.cooking-carousel-item')).toContain('flex: 0 0 calc((100% - 12px) / 2);');
    expect(getRuleBody(carouselCss, '.cooking-carousel--compact .cooking-carousel-item'))
      .toContain('flex-basis: calc((100% - 3 * 12px) / 3.25);');
  });

  describe('Restzeit groß (Feinschliff Tablet, Punkt 5)', () => {
    test('die Restzeit ist 28 px groß und ein 44-px-Feld, auch kompakt', () => {
      const status = getRuleBody(carouselCss, '.cooking-carousel-status');
      expect(status).toContain('font-size: 28px;');
      expect(status).toContain('min-height: 44px;');
      expect(status).toContain('font-variant-numeric: tabular-nums;');
      // Kompakt wurde sie früher auf 16 px verkleinert
      expect(carouselCss).not.toMatch(/\.cooking-carousel--compact \.cooking-carousel-status\s*\{/);
    });

    test('mit Stunden kleiner, sonst wird sie für die schmale Spalte zu breit', () => {
      expect(getRuleBody(carouselCss, '.cooking-carousel-status--hours')).toContain('font-size: 20px;');
    });

    test('quer ab vier Karten ohne Fortschrittsbalken, sonst bliebe auf dem iPad mini keine Zeile für den Schritt', () => {
      expect(getRuleBody(carouselCss, '.cooking-carousel--dense .cooking-carousel-steps')).toContain('display: none;');
    });

    test('steht in der zweiten Zeile rechts neben dem Schritt und rutscht bei Platzmangel darunter', () => {
      const meta = getRuleBody(carouselCss, '.cooking-carousel-meta');
      expect(meta).toContain('display: flex;');
      expect(meta).toContain('flex-wrap: wrap;');
      expect(getRuleBody(carouselCss, '.cooking-carousel-status')).toContain('margin-left: auto;');
    });

    test('der Schritt füllt den Rest der Karte und blendet unten aus, statt nach fester Zeilenzahl abzuschneiden', () => {
      const step = getRuleBody(carouselCss, '.cooking-carousel-step');
      expect(step).toContain('flex: 1 1 0;');
      expect(step).toContain('overflow: hidden;');
      expect(step).toContain('mask-image: linear-gradient(to bottom, black calc(100% - 0.8em), transparent);');
      expect(carouselCss).not.toContain('-webkit-line-clamp');
    });
  });

  test('hochkant (Entwurf T1) teilen sich ab drei Karten alle die ganze Höhe, auch kompakt schaut keine heraus', () => {
    expect(carouselCss).toMatch(
      /\.cooking-carousel--fill \.cooking-carousel-item,\s*\.cooking-carousel--fill\.cooking-carousel--compact \.cooking-carousel-item\s*\{\s*flex: 1 1 0;\s*\}/
    );
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
      // Feinschliff Tablet, Punkt 1: quer 31vw (iPad 11" 370 px statt 513), hochkant überall 360 px
      expect(split).toContain('--cooking-carousel-width: clamp(360px, 31vw, 440px);');

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

    test('iPad mini hochkant: in der schmalen Spalte rechts (384 px) stehen die Zutaten einspaltig', () => {
      expect(recipeDetailCss).toMatch(
        /@media \(max-width: 799px\) \{\s*\.cooking-mode-split \.cooking-mode-ingredients \.ingredients-list \{\s*columns: auto;\s*\}\s*\}/
      );
    });
  });

  describe('Tablet hochkant mit nur einem Rezept (RecipeDetail.css, cooking-mode-tablet-full)', () => {
    test('der Kochmodus liegt über dem ganzen Bildschirm, auch ab 769 px Breite (dort greift die Handy-Regel nicht)', () => {
      const full = getRuleBody(recipeDetailCss, '.recipe-detail-content.cooking-mode-active.cooking-mode-tablet-full');
      expect(full).toContain('position: fixed;');
      expect(full).toContain('bottom: 0;');
      expect(full).toContain('height: auto;');
      expect(full).toContain('padding-top: env(safe-area-inset-top, 0px);');
    });

    test('die Schrittkarte füllt die Breite, die Zutaten stehen zweispaltig wie im Split', () => {
      const card = getRuleBody(recipeDetailCss, '.cooking-mode-tablet-full .step-card');
      expect(card).toContain('width: 100%;');
      expect(card).toContain('max-width: none;');
      expect(getRuleBody(recipeDetailCss, '.cooking-mode-tablet-full .cooking-mode-ingredients .ingredients-list'))
        .toContain('columns: 2;');
    });
  });

  describe('Zeilenlänge bei voller Breite (RecipeDetail.css, cooking-mode-tablet-full)', () => {
    const wideBlock = /@media \(min-width: 1300px\) \{([\s\S]*?\})\s*\}/;

    test('ab 1300 px Breite (iPad 13" quer) steht der Schritttext höchstens 36em breit und mittig in der Karte', () => {
      const wide = recipeDetailCss.match(wideBlock);
      expect(wide).not.toBeNull();
      const text = getRuleBody(wide[1], '.cooking-mode-tablet-full .step-content');
      expect(text).toContain('max-width: 36em;');
      expect(text).toContain('margin-left: auto;');
      expect(text).toContain('margin-right: auto;');
    });

    test('schmalere Tablets (11" und mini quer) behalten die volle Breite, sonst scrollen lange Schritte', () => {
      const outside = recipeDetailCss.replace(wideBlock, '');
      expect(outside).not.toMatch(/\.cooking-mode-tablet-full \.step-content\s*\{[^}]*max-width/);
    });
  });

  describe('Tablet-Höhen: Schritte zu Zutaten hochkant 2 : 1, quer 1 : 1', () => {
    test('hochkant teilt im Split das Raster Schritt-Karussell und Zutaten-Sheet 2 : 1', () => {
      const split = getRuleBody(recipeDetailCss, '.recipe-detail-content.cooking-mode-active.cooking-mode-split');
      expect(split).toContain('grid-template-rows: auto auto minmax(0, 2fr) minmax(auto, 1fr);');
    });

    test('hochkant teilt bei voller Breite die Flexbox 2 : 1', () => {
      expect(getRuleBody(recipeDetailCss, '.cooking-mode-active.cooking-mode-tablet-full .step-carousel'))
        .toContain('flex: 2 1 0;');
      expect(getRuleBody(recipeDetailCss, '.recipe-detail-content.cooking-mode-active.cooking-mode-tablet-full .cooking-mode-ingredients'))
        .toContain('flex: 1 1 0;');
    });

    test('quer teilen sich Schritte und Zutaten die Höhe 1 : 1', () => {
      const landscape = recipeDetailCss.match(/@media \(orientation: landscape\) \{([\s\S]*?\})\s*\}/);
      expect(landscape).not.toBeNull();
      expect(getRuleBody(landscape[1], '.recipe-detail-content.cooking-mode-active.cooking-mode-split'))
        .toContain('grid-template-rows: auto auto minmax(0, 1fr) minmax(auto, 1fr);');
      expect(getRuleBody(landscape[1], '.cooking-mode-active.cooking-mode-tablet-full .step-carousel'))
        .toContain('flex: 1 1 0;');
    });

    test('das Zutaten-Sheet verliert auf dem Tablet die feste Handy-Höhe, behält sie aber als Untergrenze', () => {
      ['split', 'tablet-full'].forEach((layout) => {
        expect(getRuleBody(recipeDetailCss, `.recipe-detail-content.cooking-mode-active.cooking-mode-${layout} .cooking-mode-ingredients`))
          .toContain('height: auto;');
      });
      // Nie kleiner als bisher: auf dem iPad 11" quer wäre ein Drittel weniger als die alte Höhe
      ['split', 'tablet-full'].forEach((layout) => {
        expect(getRuleBody(recipeDetailCss, `.recipe-detail-content.cooking-mode-active.cooking-mode-${layout} .cooking-mode-ingredients`))
          .toContain('min-height: min(34dvh, 280px);');
      });
      // Die feste Höhe bleibt dem Handy vorbehalten
      expect(getRuleBody(recipeDetailCss, '.cooking-mode-active:not(.cooking-mode-landscape) .cooking-mode-ingredients'))
        .toContain('height: min(34dvh, 280px);');
    });
  });

  test('liegt in derselben Fläche wie die Schrittspalte, keine zwei Grautöne nebeneinander', () => {
    expect(getRuleBody(carouselCss, '.cooking-carousel')).toContain('background: var(--color-surface-subtle);');
    // Keine Linie in der Displaymitte zwischen Karussell und Rezept vorn
    expect(getRuleBody(carouselCss, '.cooking-carousel')).not.toMatch(/border(-right)?:/);
    expect(getRuleBody(recipeDetailCss, '.cooking-mode-steps')).toContain('background: var(--color-surface-subtle);');
    // Die Fläche des ganzen Kochmodus hochkant (dahinter) hat im Light-Theme denselben Wert wie das Token
    expect(lightTokens).toContain('--color-surface-subtle: #f9f9f9;');
    expect(getRuleBody(recipeDetailCss, '.recipe-detail-content.cooking-mode-active:not(.cooking-mode-landscape)'))
      .toContain('background: #f9f9f9;');
  });
});
