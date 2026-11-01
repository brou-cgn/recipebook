import fs from 'fs';
import path from 'path';

describe('RecipeDetail CSS thumbnail reset icon sizing', () => {
  const getRuleBody = (css, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  test('limits reset-thumbnail icon to the same maximum size as other FAB icons', () => {
    const cssPath = path.join(__dirname, 'RecipeDetail.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const editIconRule = getRuleBody(css, '.edit-fab-button .button-icon-image');
    const resetIconRule = getRuleBody(css, '.reset-thumbnail-fab-button .button-icon-image');

    expect(editIconRule).toContain('width: 1.4rem;');
    expect(editIconRule).toContain('height: 1.4rem;');
    expect(resetIconRule).toContain('max-width: 1.4rem;');
    expect(resetIconRule).toContain('max-height: 1.4rem;');
  });
});

describe('RecipeDetail CSS mobile FAB clearance', () => {
  test('adds padding-bottom to steps section on mobile so last step is not hidden behind FAB', () => {
    const cssPath = path.join(__dirname, 'RecipeDetail.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    // Find all @media (max-width: 768px) blocks and check that at least one
    // contains the .recipe-section--steps padding-bottom rule.
    const mediaRegex = /@media\s*\(max-width:\s*768px\)\s*\{/g;
    let match;
    let found = false;
    while ((match = mediaRegex.exec(css)) !== null) {
      // Extract the block by counting braces from the opening brace position
      const start = match.index + match[0].length;
      let depth = 1;
      let i = start;
      while (i < css.length && depth > 0) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') depth--;
        i++;
      }
      const block = css.slice(start, i - 1);
      if (/\.recipe-section--steps\s*\{[^}]*padding-bottom:\s*5rem/.test(block)) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

describe('RecipeDetail CSS desktop close button', () => {
  const getRuleBody = (css, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  test('recipe-detail__close is transparent, borderless, with 1rem padding and auto left margin', () => {
    const cssPath = path.join(__dirname, 'RecipeDetail.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const rule = getRuleBody(css, '.recipe-detail__close');

    expect(rule).toContain('background: transparent');
    expect(rule).toContain('border: none');
    expect(rule).toContain('padding: 1rem');
    expect(rule).toContain('margin-left: auto');
  });
});

describe('RecipeDetail CSS Kochmodus mit Rezept-Leiste (parallel kochen)', () => {
  const css = fs.readFileSync(path.join(__dirname, 'RecipeDetail.css'), 'utf8');
  const getRuleBody = (source, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };
  const fontClamp = (rule) => {
    const match = rule.match(/font-size:\s*clamp\(([\d.]+)rem,\s*([\d.]+)dvh,\s*([\d.]+)rem\)/);
    return match ? { min: Number(match[1]), preferred: Number(match[2]), max: Number(match[3]) } : null;
  };
  const PORTRAIT = '.cooking-mode-active:not(.cooking-mode-landscape)';
  const WITH_DOCK = '.cooking-mode-active.cooking-mode-has-dock:not(.cooking-mode-landscape)';

  test('das Zutaten-Sheet behält seine Listenhöhe, die Leiste geht vom Schritt-Karussell ab', () => {
    const sheet = getRuleBody(css, `${PORTRAIT} .cooking-mode-ingredients`);
    const sheetWithDock = getRuleBody(css, `${WITH_DOCK} .cooking-mode-ingredients`);

    expect(sheet).toContain('height: min(34dvh, 280px);');
    expect(sheet).toContain('padding: 0 1.25rem calc(1rem + env(safe-area-inset-bottom, 0px));');
    // Gleiche Listenhöhe wie ohne Leiste: nur der Abstand zur Home-Leiste, den die Leiste übernimmt, fällt weg
    expect(sheetWithDock).toContain('height: calc(min(34dvh, 280px) - env(safe-area-inset-bottom, 0px));');
    expect(sheetWithDock).toContain('padding-bottom: 1rem;');
    // Das Karussell nimmt den Rest und wird damit um die Leistenhöhe kürzer
    expect(getRuleBody(css, `${PORTRAIT} .step-carousel`)).toContain('flex: 1;');
  });

  test('die Schrift der Schrittkarten ist mit Leiste etwas kleiner', () => {
    const base = fontClamp(getRuleBody(css, `${PORTRAIT} .step-card.active`));
    const withDock = fontClamp(getRuleBody(css, `${WITH_DOCK} .step-card.active`));

    expect(base).not.toBeNull();
    expect(withDock).not.toBeNull();
    expect(withDock.min).toBeLessThan(base.min);
    expect(withDock.preferred).toBeLessThan(base.preferred);
    expect(withDock.max).toBeLessThan(base.max);
  });
});

describe('RecipeDetail CSS Querformat mit Rezept-Schiene bis an den Displayrand (parallel kochen)', () => {
  const getRuleBody = (source, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = source.match(new RegExp(`(?:^|\\})\\s*${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };
  const css = fs.readFileSync(path.join(__dirname, 'RecipeDetail.css'), 'utf8');
  const RAIL = '.cooking-mode-landscape.cooking-mode-has-rail';

  test('Zutaten und Schritte halten unten die Home-Leiste frei', () => {
    expect(getRuleBody(css, `${RAIL} .cooking-mode-ingredients,\n${RAIL} .cooking-mode-steps`))
      .toContain('padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));');
  });

  test('Schiene links: die Schrittspalte hält rechts den Abstand zur Kamera', () => {
    expect(getRuleBody(css, `${RAIL}:not(.cooking-mode-rail-right) .cooking-mode-steps`))
      .toContain('padding-right: calc(1.25rem + env(safe-area-inset-right, 0px));');
  });

  test('Schiene rechts: die Zutatenspalte hält links den Abstand und wird um ihn breiter', () => {
    const body = getRuleBody(css, `${RAIL}.cooking-mode-rail-right .cooking-mode-ingredients`);
    expect(body).toContain('flex-basis: calc(34% + env(safe-area-inset-left, 0px));');
    expect(body).toContain('max-width: calc(300px + env(safe-area-inset-left, 0px));');
    expect(body).toContain('padding-left: calc(1.25rem + env(safe-area-inset-left, 0px));');
  });
});

describe('viewport-fit=cover und die übrigen Seiten', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

  test('das HTML setzt cover von Anfang an; App und Bottom-Navigation bleiben innerhalb der Abstände', () => {
    expect(read('../../index.html')).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover[^"]*"/);
    expect(read('../App.css')).toMatch(/padding-left: env\(safe-area-inset-left, 0px\);/);
    expect(read('../App.css')).toMatch(/padding-right: env\(safe-area-inset-right, 0px\);/);
    expect(read('BottomNavigation.css')).toMatch(/padding-left: calc\(0\.5rem \+ env\(safe-area-inset-left, 0px\)\);/);
  });
});

describe('RecipeDetail CSS Querformat: Schritte nur per Wischen', () => {
  const css = fs.readFileSync(path.join(__dirname, 'RecipeDetail.css'), 'utf8');

  test('keine Buttons „Nächster Schritt“ und „Zurück“ mehr', () => {
    expect(css).not.toContain('.step-nav');
    expect(css).toMatch(/\.cooking-mode-landscape \.cooking-mode-steps \{[^}]*grid-template-rows: auto minmax\(0, 1fr\);/);
  });
});
