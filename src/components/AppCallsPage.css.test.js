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
});

describe('AppCallsPage dark mode styles', () => {
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
});
