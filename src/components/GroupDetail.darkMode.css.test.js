import fs from 'fs';
import path from 'path';

describe('GroupDetail dark mode styles', () => {
  const getRuleBody = (css, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  test('uses readable dark mode color for "Mitglieder" and "Rezepte" headings in group-detail-section', () => {
    const cssPath = path.join(__dirname, '..', 'darkMode.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const rule = getRuleBody(css, '[data-theme="dark"] .group-detail-section h3');

    expect(rule).toContain('color: #e8e8e8;');
  });

  test('uses readable dark mode color for "Mitglieder" and "Rezepte" headings in group-section-header', () => {
    const cssPath = path.join(__dirname, '..', 'darkMode.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const rule = getRuleBody(css, '[data-theme="dark"] .group-section-header h3');

    expect(rule).toContain('color: #e8e8e8;');
  });
});
