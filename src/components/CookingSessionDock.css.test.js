import fs from 'fs';
import path from 'path';

// Rezept-Leiste der Kochsitzung (Vorhaben „Parallel kochen“): Sie liegt im App-Hintergrund statt
// in Braun, die Chips sind Karten wie im Rest der App. Light und Dark kommen aus tokens.css.
const readCss = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const getRuleBody = (css, selector) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  return match ? match[1] : '';
};

describe('CookingSessionDock CSS', () => {
  const dockCss = readCss('CookingSessionDock.css');
  const tokensCss = readCss('../tokens.css');

  test('die Leiste liegt im App-Hintergrund, die Chips sind Karten', () => {
    expect(getRuleBody(dockCss, '.cooking-dock')).toContain('background: var(--color-bg);');
    expect(getRuleBody(dockCss, '.cooking-dock-chip-main')).toContain('background: var(--color-surface-card);');
  });

  test('nutzt nur Farb-Tokens, die tokens.css für Light und Dark definiert', () => {
    const used = [...new Set([...dockCss.matchAll(/var\((--color-[a-z-]+)/g)].map((m) => m[1]))];
    const light = getRuleBody(tokensCss, ':root');
    const dark = getRuleBody(tokensCss, '[data-theme="dark"]');
    const missing = used.filter((token) => !light.includes(`${token}:`) || !dark.includes(`${token}:`));

    expect(used.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
});
