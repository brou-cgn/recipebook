import fs from 'fs';
import path from 'path';

const getRuleBody = (css, selector) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  return match ? match[1] : '';
};

describe('NutritionModal dark mode styles', () => {
  let css = '';

  beforeAll(() => {
    const cssPath = path.join(__dirname, '..', 'darkMode.css');
    css = fs.readFileSync(cssPath, 'utf8');
  });

  test('uses dark backgrounds for composition toggle and table header', () => {
    const toggleRule = getRuleBody(css, '[data-theme="dark"] .nutrition-composition-toggle');
    const headerRule = getRuleBody(css, '[data-theme="dark"] .nutrition-composition-table th');

    expect(toggleRule).toContain('background: #2a2a2a;');
    expect(toggleRule).toContain('color: #e8e8e8;');
    expect(headerRule).toContain('background: #2a2a2a;');
    expect(headerRule).toContain('color: #ccc;');
  });

  test('uses dark styles for calculation progress banner', () => {
    const progressRule = getRuleBody(css, '[data-theme="dark"] .nutrition-calc-progress');
    const headerRule = getRuleBody(css, '[data-theme="dark"] .nutrition-calc-progress-header');

    expect(progressRule).toContain('background');
    expect(progressRule).toContain('border');
    expect(headerRule).toContain('color');
  });

  test('uses a distinct readable highlight color for AI-estimated composition rows', () => {
    const rowRule = getRuleBody(css, '[data-theme="dark"] .nutrition-composition-row--ai-estimated td');
    const badgeRule = getRuleBody(css, '[data-theme="dark"] .nutrition-ai-estimated-badge');

    expect(rowRule).toContain('background: #33280f;');
    expect(badgeRule).toContain('color: #ffd27a;');
  });
});
