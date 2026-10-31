import fs from 'fs';
import path from 'path';

// Rezept-Leiste der Kochsitzung (Vorhaben „Parallel kochen“): Sie liegt im App-Hintergrund statt
// in Braun, die Chips haben keine Fläche wie im Rest der App. Light und Dark kommen aus tokens.css.
const readCss = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const getRuleBody = (css, selector) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  return match ? match[1] : '';
};

describe('CookingSessionDock CSS', () => {
  const dockCss = readCss('CookingSessionDock.css');
  const tokensCss = readCss('../tokens.css');

  test('der Container ist vollständig transparent (kein Rahmen, kein Hintergrund), die Chips haben keine Fläche', () => {
    expect(getRuleBody(dockCss, '.cooking-dock')).toContain('background: transparent;');
    expect(getRuleBody(dockCss, '.cooking-dock--inline')).not.toContain('border');
    expect(getRuleBody(dockCss, '.cooking-dock--top')).not.toContain('border');
    const chip = getRuleBody(dockCss, '.cooking-dock-chip-main');
    expect(chip).toContain('background: transparent;');
    expect(chip).toContain('border: none;');
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
