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

  test('group-detail-section uses a transparent border-color in dark mode', () => {
    const cssPath = path.join(__dirname, '..', 'darkMode.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const rule = getRuleBody(css, '[data-theme="dark"] .group-detail-section');

    expect(rule).toContain('border-color: transparent;');
  });

  test('group-member-row has no border-color in dark mode', () => {
    const cssPath = path.join(__dirname, '..', 'darkMode.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const rule = getRuleBody(css, '[data-theme="dark"] .group-member-row');

    expect(rule).not.toContain('border-color');
    expect(rule).not.toContain('border:');
  });

  test('styles private list settings button with dark background in header actions', () => {
    const cssPath = path.join(__dirname, '..', 'darkMode.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const rule = getRuleBody(css, '[data-theme="dark"] .group-header-actions .list-settings-trigger-button');

    expect(rule).toContain('background: #2a2a2a !important;');
    expect(rule).toContain('border-color: #555 !important;');
    expect(rule).toContain('color: #e8e8e8;');
  });
});

describe('GroupDetail light mode styles', () => {
  test('keeps settings button boxed but back button transparent in header actions', () => {
    const cssPath = path.join(__dirname, 'GroupDetail.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const settingsRule = getRuleBody(css, '.group-header-actions .list-settings-trigger-button');
    const shoppingRule = getRuleBody(css, '.group-header-actions .shopping-list-trigger-button');
    const settingsIconRule = getRuleBody(css, '.list-settings-icon-img');
    const backRule = getRuleBody(css, '.group-header-actions .group-back-icon-btn');

    expect(settingsRule).toContain('background: #fff !important;');
    expect(settingsRule).toContain('border: 1px solid #f0f0f0 !important;');
    expect(backRule).toContain('background: transparent !important;');
    expect(backRule).toContain('border: none !important;');
    expect(backRule).toContain('-webkit-tap-highlight-color: transparent;');
    expect(backRule).toContain('touch-action: manipulation;');
    expect(settingsRule).toContain('display: inline-flex;');
    expect(backRule).toContain('display: inline-flex;');
    expect(settingsRule).toContain('-webkit-tap-highlight-color: transparent;');
    expect(settingsRule).toContain('touch-action: manipulation;');
    expect(shoppingRule).toContain('-webkit-tap-highlight-color: transparent;');
    expect(shoppingRule).toContain('touch-action: manipulation;');
    expect(settingsIconRule).toContain('width: 1.5rem;');
    expect(settingsIconRule).toContain('height: 1.5rem;');
  });

  test('uses unified active feedback on settings and shopping list header action buttons', () => {
    const cssPath = path.join(__dirname, 'GroupDetail.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const settingsActiveRule = getRuleBody(css, '.group-header-actions .list-settings-trigger-button:active');
    const shoppingActiveRule = getRuleBody(css, '.group-header-actions .shopping-list-trigger-button:active');

    expect(settingsActiveRule).toContain('transform: scale(1.1);');
    expect(settingsActiveRule).toContain('opacity: 0.2;');
    expect(shoppingActiveRule).toContain('transform: scale(1.1);');
    expect(shoppingActiveRule).toContain('opacity: 0.2;');
  });

  test('group-recipes-section removes the panel background and padding for recipe overview tiles', () => {
    const cssPath = path.join(__dirname, 'GroupDetail.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const rule = getRuleBody(css, '.group-recipes-section');

    expect(rule).toContain('background: transparent;');
    expect(rule).toContain('padding: 0;');
  });

  test('group-detail-section has no box-shadow in light mode', () => {
    const cssPath = path.join(__dirname, 'GroupDetail.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const rule = getRuleBody(css, '.group-detail-section');

    expect(rule).toContain('border: 1px solid transparent;');
    expect(rule).not.toContain('box-shadow');
  });

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

  test('group-recipes-section stays transparent in dark mode', () => {
    const cssPath = path.join(__dirname, '..', 'darkMode.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const rule = getRuleBody(css, '[data-theme="dark"] .group-detail-section.group-recipes-section');

    expect(rule).toContain('background: transparent;');
  });
});
