import fs from 'fs';
import path from 'path';

describe('Startseite dark mode styles', () => {
  const getRuleBody = (css, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  test('styles the Küche-Aktion FAB button for dark mode', () => {
    const cssPath = path.join(__dirname, '..', 'darkMode.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const rule = getRuleBody(css, '[data-theme="dark"] .startseite-fab-button');

    expect(rule).toContain('background: #2a2a2a;');
    expect(rule).toContain('color: #e8e8e8;');
    expect(rule).toContain('border-color: #555;');
  });
});
