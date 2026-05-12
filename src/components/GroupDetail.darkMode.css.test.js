import fs from 'fs';
import path from 'path';

const getRuleBody = (css, selector) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  return match ? match[1] : '';
};

describe('GroupDetail dark mode styles', () => {
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

  test('group-member-row has no border-color in dark mode', () => {
    const cssPath = path.join(__dirname, '..', 'darkMode.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const rule = getRuleBody(css, '[data-theme="dark"] .group-member-row');

    expect(rule).not.toContain('border-color');
    expect(rule).not.toContain('border:');
  });
});

describe('GroupDetail light mode styles', () => {
  test('group-member-row has no border in light mode', () => {
    const cssPath = path.join(__dirname, 'GroupDetail.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const rule = getRuleBody(css, '.group-member-row');

    expect(rule).not.toContain('border: 1px solid');
  });

  test('group-member-row has min-height set for equal row heights', () => {
    const cssPath = path.join(__dirname, 'GroupDetail.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const rule = getRuleBody(css, '.group-member-row');

    expect(rule).toContain('min-height');
  });
});
