import fs from 'fs';
import path from 'path';

// Der Knopf oben rechts im Kochmodus soll aussehen und sich bewegen wie die FAB-Buttons
// (.edit-fab-button in RecipeDetail.css). Dieser Test hält beides gleich: Formatierung,
// Druck-Animation und die Farben in Light und Dark (dort über Tokens statt fester Werte).
const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const normalize = (text) => text.replace(/\s+/g, ' ').trim();

// n-ter Block mit genau diesem Selektor (0 = Hauptregel, 1 = Regel in der Mobil-Media-Query)
const ruleBody = (css, selector, nth = 0) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...css.matchAll(new RegExp(`(?:^|[\\s}])${escaped}\\s*\\{([^}]*)\\}`, 'g'))];
  return matches[nth] ? normalize(matches[nth][1]) : '';
};

const declarations = (body) => Object.fromEntries(
  body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const i = d.indexOf(':');
    return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
  })
);

const hex = (value) => (value === 'white' ? '#fff' : value);
const tokenName = (value) => value.match(/var\((--[a-z-]+)\)/)?.[1];

describe('Knopf „Rezept dazunehmen“: gleiche Formatierung und Animation wie die FAB-Buttons', () => {
  const buttonCss = read('CookingAddRecipeButton.css');
  const fabCss = read('RecipeDetail.css');
  const darkCss = read('../darkMode.css');
  const tokensCss = read('../tokens.css');

  const fab = declarations(ruleBody(fabCss, '.edit-fab-button'));
  const mine = declarations(ruleBody(buttonCss, '.cooking-mode-add-recipe'));

  test('Form, Schatten, Schrift und Berührungsverhalten wie beim FAB', () => {
    ['width', 'height', 'min-width', 'max-width', 'padding', 'border-radius', 'font-size', 'cursor', 'box-shadow',
      'display', 'align-items', 'justify-content', '-webkit-tap-highlight-color', 'appearance', 'touch-action', 'will-change']
      .forEach((property) => {
        expect(fab[property]).toBeDefined();
        expect({ property, value: mine[property] }).toEqual({ property, value: fab[property] });
      });
  });

  test('federnde Übergänge wie beim FAB', () => {
    expect(fab.transition).toContain('cubic-bezier(0.34, 1.56, 0.64, 1)');
    expect(mine.transition).toBe(fab.transition);
  });

  test('beim Drücken wächst der Knopf um 15 % und der Schatten wird größer, wie beim FAB', () => {
    const fabPressed = declarations(ruleBody(fabCss, '.edit-fab-button.pressed'));
    const myPressed = declarations(ruleBody(buttonCss, '.cooking-mode-add-recipe.pressed'));

    expect(fabPressed.transform).toBe('scale(1.15)');
    expect(myPressed).toEqual(fabPressed);
  });

  test('mobil 56 px und leicht durchscheinend wie beim FAB', () => {
    const fabMobile = declarations(ruleBody(fabCss, '.edit-fab-button', 1));
    const myMobile = declarations(ruleBody(buttonCss, '.cooking-mode-add-recipe', 1));

    expect(fabMobile.width).toBe('56px');
    expect(fabMobile.opacity).toBe('0.85');
    expect(myMobile).toEqual(fabMobile);
    expect(buttonCss).toMatch(/@media \(max-width: 768px\)/);
  });

  test('Icon so groß wie beim FAB', () => {
    expect(ruleBody(buttonCss, '.cooking-mode-add-recipe .button-icon-image'))
      .toBe(ruleBody(fabCss, '.edit-fab-button .button-icon-image'));
  });

  test('Light: Fläche, Schrift und Rand über Tokens mit den Werten des FAB', () => {
    const light = declarations(ruleBody(tokensCss, ':root'));
    const used = { background: tokenName(mine.background), color: tokenName(mine.color), border: tokenName(mine.border) };

    expect(Object.values(used).every(Boolean)).toBe(true);
    expect({ background: light[used.background], color: light[used.color], border: light[used.border] }).toEqual({
      background: hex(fab.background),
      color: fab.color,
      border: fab.border.split(' ').pop(),
    });
  });

  test('Dark: dieselben Tokens liefern die Werte des FAB im Dunkelmodus', () => {
    const dark = declarations(ruleBody(tokensCss, '[data-theme="dark"]'));
    const fabDark = declarations(ruleBody(darkCss, '[data-theme="dark"] .edit-fab-button'));

    expect({
      background: dark[tokenName(mine.background)],
      color: dark[tokenName(mine.color)],
      border: dark[tokenName(mine.border)],
    }).toEqual({
      background: fabDark.background,
      color: fabDark.color,
      border: fabDark['border-color'],
    });
  });
});
