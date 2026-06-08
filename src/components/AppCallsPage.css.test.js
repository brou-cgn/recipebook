import fs from 'fs';
import path from 'path';

const getRuleBody = (css, selector) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  return match ? match[1] : '';
};

describe('AppCallsPage CSS layout', () => {
  test('renders kochatelier settings grid in a single column', () => {
    const cssPath = path.join(__dirname, 'AppCallsPage.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const gridRule = getRuleBody(css, '.kochatelier-settings-grid');

    expect(gridRule).toContain('grid-template-columns: 1fr;');
  });

  test('keeps kochatelier inputs at 16px without a mobile-only font-size override', () => {
    const cssPath = path.join(__dirname, 'AppCallsPage.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const fieldRule = getRuleBody(css, '.kochatelier-settings-field input,\n.kochatelier-settings-field textarea');
    const fontSizeMatches = css.match(/font-size:\s*16px;/g) || [];

    expect(fieldRule).toContain('font-size: 16px;');
    expect(fontSizeMatches).toHaveLength(1);
  });

  test('matches standard unit group heading size to settings section headings', () => {
    const cssPath = path.join(__dirname, 'AppCallsPage.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const headingRule = getRuleBody(css, '.standard-terms-group-section h4');

    expect(headingRule).toContain('font-size: 1.25rem;');
    expect(headingRule).toContain('font-weight: 700;');
  });

  test('styles ingredient-match confirm button with red to match Küchenbetrieb color scheme', () => {
    const cssPath = path.join(__dirname, 'AppCallsPage.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const confirmRule = getRuleBody(css, '.ingredient-match-dialog-confirm');

    expect(confirmRule).toContain('background: #d32f2f;');
    expect(confirmRule).toContain('color: #fff;');
    expect(confirmRule).toContain('border-color: #d32f2f;');
  });
});

describe('AppCallsPage dark mode styles', () => {
  test('removes inactive tab background while keeping active tab highlighted', () => {
    const cssPath = path.join(__dirname, '..', 'darkMode.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const tabRule = getRuleBody(css, '[data-theme="dark"] .app-calls-tab');
    const activeTabRule = getRuleBody(css, '[data-theme="dark"] .app-calls-tab.active');

    expect(tabRule).toContain('background: transparent;');
    expect(activeTabRule).toContain('color: #DF7A00;');
    expect(activeTabRule).toContain('border-bottom-color: #DF7A00;');
  });

  test('styles kochatelier settings groups and fields for dark mode', () => {
    const cssPath = path.join(__dirname, '..', 'darkMode.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const groupRule = getRuleBody(css, '[data-theme="dark"] .kochatelier-settings-group');
    const headingRule = getRuleBody(css, '[data-theme="dark"] .kochatelier-settings-group h3');
    const labelRule = getRuleBody(css, '[data-theme="dark"] .kochatelier-settings-field label');
    const feedbackRule = getRuleBody(css, '[data-theme="dark"] .kochatelier-settings-feedback');

    expect(groupRule).toContain('background: #1e1e1e;');
    expect(groupRule).toContain('border-color: #3d3d3d;');
    expect(headingRule).toContain('color: #e08080;');
    expect(labelRule).toContain('color: #aaa;');
    expect(css).toContain('[data-theme="dark"] .kochatelier-settings-field input,');
    expect(css).toContain('[data-theme="dark"] .kochatelier-settings-field textarea {');
    expect(css).toContain('background: #2a2a2a;');
    expect(css).toContain('color: #e8e8e8;');
    expect(css).toContain('border-color: #555;');
    expect(css).toContain('[data-theme="dark"] .kochatelier-settings-field input:focus,');
    expect(css).toContain('[data-theme="dark"] .kochatelier-settings-field textarea:focus {');
    expect(css).toContain('border-color: #e57373;');
    expect(feedbackRule).toContain('color: #aaa;');
  });

  test('keeps standard unit group headings readable in dark mode', () => {
    const cssPath = path.join(__dirname, '..', 'darkMode.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const headingRule = getRuleBody(css, '[data-theme="dark"] .standard-terms-group-section h4');

    expect(headingRule).toContain('color: #e8e8e8;');
  });
});
