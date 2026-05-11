import fs from 'fs';
import path from 'path';

describe('Group list dark mode pill styles', () => {
  const getRuleBody = (css, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  test('defines readable dark mode styles for private and list-kind pills', () => {
    const cssPath = path.join(__dirname, '../darkMode.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    const privatePillRule = getRuleBody(css, '[data-theme="dark"] .group-type-indicator.private');
    const listKindPillRule = getRuleBody(css, '[data-theme="dark"] .group-list-kind-indicator');

    expect(privatePillRule).toContain('background: #2a1a2f;');
    expect(privatePillRule).toContain('color: #ce93d8;');
    expect(listKindPillRule).toContain('background: #1f2540;');
    expect(listKindPillRule).toContain('color: #b3c0ff;');
  });
});
