import fs from 'fs';
import path from 'path';

// Die Tutorialkarte soll in der Rezeptuebersicht denselben Schatten tragen
// wie die Rezeptkarte. Der Schatten sitzt auf .tutorial-card-content, also
// darf der Wrapper .tutorial-card ihn nicht wegclippen - genau das tat ein
// overflow: hidden bei identischer Groesse und identischem Radius.
describe('TutorialCard CSS shadow', () => {
  const css = fs.readFileSync(path.join(__dirname, 'TutorialCard.css'), 'utf8');
  const recipeListCss = fs.readFileSync(path.join(__dirname, 'RecipeList.css'), 'utf8');
  const darkCss = fs.readFileSync(path.join(__dirname, '..', 'darkMode.css'), 'utf8');

  const getRuleBody = (source, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };
  const getShadow = (ruleBody) => {
    const match = ruleBody.match(/box-shadow:\s*([^;]+);/);
    return match ? match[1].trim() : null;
  };

  test('wrapper does not clip the content shadow', () => {
    const wrapperRule = getRuleBody(css, '.tutorial-card');

    expect(wrapperRule).not.toContain('overflow: hidden');
  });

  test('content carries the same shadow as the recipe card', () => {
    const tutorialShadow = getShadow(getRuleBody(css, '.tutorial-card-content'));
    const recipeShadow = getShadow(getRuleBody(recipeListCss, '.recipe-card'));

    expect(recipeShadow).toBeTruthy();
    expect(tutorialShadow).toBe(recipeShadow);
  });

  test('content carries the same dark-mode shadow as the recipe card', () => {
    const tutorialShadow = getShadow(getRuleBody(css, '[data-theme="dark"] .tutorial-card-content'));
    const recipeShadow = getShadow(getRuleBody(darkCss, '[data-theme="dark"] .recipe-card'));

    expect(recipeShadow).toBeTruthy();
    expect(tutorialShadow).toBe(recipeShadow);
  });
});
