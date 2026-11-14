import fs from 'fs';
import path from 'path';

// Titelzeile des Kochmodus (Feinschliff Tablet, Punkte 2 und 3)
const readCss = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const getRuleBody = (css, selector) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\})\\s*${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  return match ? match[1] : '';
};

const areas = (body) => (body.match(/grid-template-areas:\s*([^;]*);/) || [])[1]?.replace(/\s+/g, ' ').trim();

describe('CookingModeTitleBar CSS', () => {
  const css = readCss('CookingModeTitleBar.css');
  const recipeDetailCss = readCss('RecipeDetail.css');
  const carouselCss = readCss('CookingSessionCarousel.css');
  const tokens = readCss('../tokens.css');
  const [lightTokens, darkTokens] = tokens.split(/\n\[data-theme="dark"\] \{/);
  const landscape = (css.match(/@media \(orientation: landscape\) \{([\s\S]*?\})\s*\}/) || [])[1] || '';

  test('nur Farb-Tokens, die es in Light und Dark gibt', () => {
    const used = [...new Set([...css.matchAll(/var\((--color-[a-z-]+)/g)].map((m) => m[1]))];
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((token) => !lightTokens.includes(`${token}:`) || !darkTokens.includes(`${token}:`))).toEqual([]);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  test('Handy: Name und Knopf in einer Zeile, Chips darunter', () => {
    expect(areas(getRuleBody(css, '.cooking-mode-titlebar'))).toBe('"titles add" "chips chips"');
  });

  test('Tablet hochkant: Bild, Name und Knopf, Chips darunter; quer stehen die Chips neben dem Namen', () => {
    expect(areas(getRuleBody(css, '.cooking-mode-titlebar--tablet'))).toBe('"thumb titles add" "chips chips chips"');
    expect(areas(getRuleBody(landscape, '.cooking-mode-titlebar--tablet'))).toBe('"thumb titles chips add"');
  });

  test('auf dem Tablet Bild und „+“ 56 px, der Name 24 px', () => {
    const thumb = getRuleBody(css, '.cooking-mode-titlebar-thumb');
    expect(thumb).toContain('width: 52px;');
    expect(getRuleBody(css, '.cooking-mode-titlebar--tablet .cooking-mode-add-recipe')).toContain('height: 56px;');
    expect(getRuleBody(css, '.cooking-mode-titlebar--tablet .cooking-mode-titlebar-title')).toContain('font-size: 24px;');
  });

  test('Chips sind Knöpfe mit mindestens 44 px, bald fällige orange wie Leiste und Karussell', () => {
    expect(getRuleBody(css, '.cooking-mode-timer-chip')).toContain('min-height: 44px;');
    // Auf dem Handy kompakt, damit zwei nebeneinander passen; auf dem Tablet so groß wie die Restzeit im Karussell
    expect(getRuleBody(css, '.cooking-mode-timer-chip .cooking-mode-timer-chip-time')).toContain('font-size: 18px;');
    expect(getRuleBody(css, '.cooking-mode-titlebar--tablet .cooking-mode-timer-chip .cooking-mode-timer-chip-time')).toContain('font-size: 22px;');
    expect(getRuleBody(css, '.cooking-mode-timer-chip--urgent')).toContain('background: var(--color-accent);');
  });

  test('Textfarben auf Spans mit zwei Klassen, sonst gewinnt [data-theme="dark"] span (Tech-Check A7)', () => {
    expect(getRuleBody(css, '.cooking-mode-timer-chip .cooking-mode-timer-chip-time')).toContain('color: inherit;');
    expect(getRuleBody(css, '.cooking-mode-timer-chip .cooking-mode-timer-chip-step')).toContain('color: inherit;');
    expect(getRuleBody(css, '.cooking-mode-titlebar .cooking-mode-titlebar-step')).toContain('color: var(--color-text-muted);');
  });

  test('im Kochmodus bleibt die Titelzeile oben, die Überschrift links steht auf ihrer Höhe', () => {
    expect(getRuleBody(recipeDetailCss, '.cooking-mode-titlebar')).toContain('order: 0;');
    expect(getRuleBody(carouselCss, '.cooking-carousel-heading')).toContain('min-height: 56px;');
  });
});
