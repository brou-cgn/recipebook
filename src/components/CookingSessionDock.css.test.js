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

  test('nach dem Linksswipe ist die Fläche zum Entfernen sichtbar und antippbar', () => {
    // Die Grundregel in DeleteRowButton.css blendet sie aus (opacity 0, pointer-events none)
    const body = getRuleBody(dockCss, '.cooking-dock-chip.swipe-delete-active .swipe-delete-background');
    expect(body).toContain('opacity: 1;');
    expect(body).toContain('pointer-events: auto;');
    // Der Chip deckt sie dabei ab, damit Name und Status nicht auf Rot stehen
    expect(getRuleBody(dockCss, '.cooking-dock-chip.swipe-delete-active .cooking-dock-chip-main'))
      .toContain('background: var(--color-bg);');
  });

  test('in der Bild-Stufe füllt das Bild den Kreis fast, der orange Ring bleibt dünn', () => {
    const body = getRuleBody(dockCss, '.cooking-dock--thumb .cooking-dock-chip-thumb');
    expect(body).toContain('width: 48px;');
    expect(body).toContain('height: 48px;');
  });
});
