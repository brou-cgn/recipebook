import fs from 'fs';
import path from 'path';

const getRuleBody = (css, selector) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  return match ? match[1] : '';
};

describe('ingredient-match-dialog dark mode styles', () => {
  let css = '';

  beforeAll(() => {
    const cssPath = path.join(__dirname, '..', 'darkMode.css');
    css = fs.readFileSync(cssPath, 'utf8');
  });

  test('uses a dark background for the dialog container', () => {
    const rule = getRuleBody(css, '[data-theme="dark"] .ingredient-match-dialog');
    expect(rule).toContain('background: #1f1f1f;');
    expect(rule).toContain('color: #f0f0f0;');
  });

  test('uses a light color for the close button', () => {
    const rule = getRuleBody(css, '[data-theme="dark"] .ingredient-match-dialog-close');
    expect(rule).toContain('color: #ddd;');
  });

  test('uses a readable muted color for the note text', () => {
    const rule = getRuleBody(css, '[data-theme="dark"] .ingredient-match-dialog-note');
    expect(rule).toContain('color: #ccc;');
  });

  test('uses dark borders for the ingredient list', () => {
    const listRule = getRuleBody(css, '[data-theme="dark"] .ingredient-match-dialog-list');
    expect(listRule).toContain('border-color: #3a3a3a;');

    const listItemRule = getRuleBody(css, '[data-theme="dark"] .ingredient-match-dialog-list li');
    expect(listItemRule).toContain('border-bottom-color: #3a3a3a;');
  });

  test('uses dark background and light text for the select element', () => {
    const rule = getRuleBody(css, '[data-theme="dark"] .ingredient-match-dialog-list select');
    expect(rule).toContain('background: #2a2a2a;');
    expect(rule).toContain('color: #e8e8e8;');
    expect(rule).toContain('border-color: #555;');
  });

  test('uses dark background for the cancel button', () => {
    const rule = getRuleBody(css, '[data-theme="dark"] .ingredient-match-dialog-cancel');
    expect(rule).toContain('background: #2a2a2a;');
    expect(rule).toContain('color: #e8e8e8;');
    expect(rule).toContain('border-color: #555;');
  });
});
