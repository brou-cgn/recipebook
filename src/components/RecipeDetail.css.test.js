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
  const css = fs.readFileSync(path.join(__dirname, 'RecipeDetail.css'), 'utf8');
  const getRuleBody = (source, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = source.match(new RegExp(`(?:^|\\})\\s*${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };
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
    expect(body).toContain('width: calc(34% + env(safe-area-inset-left, 0px));');
    expect(body).toContain('max-width: calc(300px + env(safe-area-inset-left, 0px));');
    expect(body).toContain('padding-left: calc(1.25rem + env(safe-area-inset-left, 0px));');
  });
});

describe('viewport-fit=cover nur im Kochmodus quer, nicht für die ganze App', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

  test('index.html setzt kein viewport-fit (PR #3594 verschob damit die ganze App)', () => {
    expect(read('../../index.html')).not.toMatch(/<meta name="viewport" content="[^"]*viewport-fit/);
  });

  test('bleibt cover nach dem Verlassen quer stehen, halten App und Bottom-Navigation links und rechts die Abstände', () => {
    expect(read('../App.css')).toMatch(/padding-left: env\(safe-area-inset-left, 0px\);/);
    expect(read('../App.css')).toMatch(/padding-right: env\(safe-area-inset-right, 0px\);/);
    expect(read('BottomNavigation.css')).toMatch(/padding-left: calc\(0\.5rem \+ env\(safe-area-inset-left, 0px\)\);/);
    expect(read('BottomNavigation.css')).toMatch(/padding-right: calc\(0\.5rem \+ env\(safe-area-inset-right, 0px\)\);/);
  });
});

describe('RecipeDetail CSS Querformat: Schritte nur per Wischen', () => {
  const css = fs.readFileSync(path.join(__dirname, 'RecipeDetail.css'), 'utf8');

  test('keine Buttons „Nächster Schritt“ und „Zurück“ mehr', () => {
    expect(css).not.toContain('.step-nav');
    expect(css).toMatch(/\.cooking-mode-landscape \.cooking-mode-steps \{[^}]*grid-template-rows: auto minmax\(0, 1fr\);/);
  });
});

describe('RecipeDetail CSS – Abschnittsüberschriften im Zutaten-Sheet des Kochmodus', () => {
  const css = fs.readFileSync(path.join(__dirname, 'RecipeDetail.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  test('stehen bündig mit der Liste und ragen nicht links über die Zeile „Zutaten für“ hinaus', () => {
    const indent = (selector) => rule(selector).match(/padding-left:\s*([\d.]+)rem/)[1];
    const heading = rule('.cooking-mode-active .cooking-mode-ingredients .ingredient-heading').match(/margin-left:\s*-([\d.]+)rem/);

    expect(heading).not.toBeNull();
    expect(heading[1]).toBe(indent('.cooking-mode-active:not(.cooking-mode-landscape) .cooking-mode-ingredients .ingredients-list'));
    expect(heading[1]).toBe(indent('.cooking-mode-landscape .cooking-mode-ingredients .ingredients-list'));
  });
});

describe('RecipeDetail CSS – Timer in der Schrittkarte (Feinschliff Tablet, Punkt 4)', () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const css = read('RecipeDetail.css');
  const tokens = read('../tokens.css');
  const darkCss = read('../darkMode.css');
  const [lightTokens, darkTokens] = tokens.split(/\n\[data-theme="dark"\] \{/);
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  test('Start-Knopf und laufende Zeit sind 48 px hoch, Stoppen ist 44 × 44 px groß (vorher 27 und 24 px)', () => {
    expect(rule('.step-timer-start-btn')).toContain('min-height: 48px;');
    expect(rule('.step-timer-top-area')).toContain('min-height: 48px;');
    const stop = rule('.step-timer-btn.stop');
    expect(stop).toContain('width: 44px;');
    expect(stop).toContain('height: 44px;');
  });

  test('Farben nur über Tokens, die es in Light und Dark gibt; darkMode.css braucht keine Regeln mehr dafür', () => {
    ['.step-timer-start-btn', '.step-timer-top-area', '.step-timer-time', '.step-timer-top-area .step-timer-time',
      '.step-timer-top-area .step-timer-time.finished'].forEach((selector) => {
      expect(rule(selector)).not.toBe('');
      expect(rule(selector)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    });
    ['--color-timer-surface', '--color-timer-border', '--color-timer-text', '--color-timer-done'].forEach((token) => {
      expect(css).toContain(`var(${token})`);
      expect(lightTokens).toContain(`${token}:`);
      expect(darkTokens).toContain(`${token}:`);
    });
    expect(darkCss).not.toMatch(/\.step-timer-top-area|\.step-timer-time\b/);
  });

  test('die Farben schlagen die Sammelregel [data-theme="dark"] span aus darkMode.css (zwei Klassen)', () => {
    expect(darkCss).toMatch(/\[data-theme="dark"\] span,/);
    expect(rule('.step-timer-top-area .step-timer-time')).toContain('color: var(--color-timer-text);');
    expect(rule('.step-timer-start-btn .step-timer-start-label')).toContain('color: inherit;');
    expect(rule('.step-timer-time')).not.toContain('color:');
  });

  test('das Häkchen eines abgelaufenen Timers ist im Light-Theme dunkler grün (4,5 : 1 statt 2,5 : 1 auf dem Beige)', () => {
    expect(rule('.step-timer-top-area .step-timer-time.finished')).toContain('color: var(--color-timer-done);');
    expect(lightTokens).toContain('--color-timer-done: #2e7d32;');
    expect(lightTokens).toContain('--color-timer-surface: #f5f0eb;');
  });

  test('auf breiten Schrittkarten fließt der Text um den Timer, auf dem Handy hochkant behält er seine Zeile', () => {
    expect(css).toMatch(
      /\.cooking-mode-landscape \.step-timer-header,\s*\.cooking-mode-split \.step-timer-header,\s*\.cooking-mode-tablet-full \.step-timer-header\s*\{\s*float: right;/
    );
    expect(rule('.step-timer-header')).not.toContain('float');
    // iPad mini hochkant: Die rechte Spalte ist nur 384 px breit
    expect(css).toMatch(/@media \(max-width: 799px\) \{\s*\.cooking-mode-split \.step-timer-header \{\s*float: none;/);
  });
});

describe('RecipeDetail CSS – lange Schritte auf dem Tablet (Feinschliff Tablet, Punkt 6)', () => {
  const css = fs.readFileSync(path.join(__dirname, 'RecipeDetail.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  test('ohne Zähler unten gibt die Schrittkarte die 4rem dafür frei', () => {
    expect(rule('.recipe-detail-content.cooking-mode-active.cooking-mode-step-in-titlebar .step-card.step-card--no-counter'))
      .toContain('padding-bottom: 1.5rem;');
  });

  test('zwei kleinere Schriftstufen, nicht unter 24 px, nur in den Tablet-Layouts', () => {
    expect(css).toMatch(
      /\.cooking-mode-split \.step-card\[data-fit="1"\],\s*\.recipe-detail-content\.cooking-mode-active\.cooking-mode-tablet-full \.step-card\[data-fit="1"\]\s*\{\s*font-size: clamp\(1\.5rem, 3\.25dvh, 1\.7rem\);/
    );
    expect(css).toMatch(
      /\.cooking-mode-split \.step-card\[data-fit="2"\],\s*\.recipe-detail-content\.cooking-mode-active\.cooking-mode-tablet-full \.step-card\[data-fit="2"\]\s*\{\s*font-size: 1\.5rem;/
    );
    // Auf dem Handy keine Stufen
    expect(css).not.toMatch(/cooking-mode-active:not\(\.cooking-mode-landscape\) \.step-card\[data-fit/);
  });
});
