import fs from 'fs';
import path from 'path';

describe('GroupList dark mode styles', () => {
  const getRuleBody = (css, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  test('uses readable dark mode color for list names', () => {
    const cssPath = path.join(__dirname, '..', 'darkMode.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const rule = getRuleBody(css, '[data-theme="dark"] .group-card-content h3');

    expect(rule).toContain('color: #e8e8e8;');
  });

  test('styles the add-list FAB like dark mode recipe add FAB', () => {
    const cssPath = path.join(__dirname, '..', 'darkMode.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const rule = getRuleBody(css, '[data-theme="dark"] .add-group-fab-button');

    expect(rule).toContain('background: #2a2a2a;');
    expect(rule).toContain('color: #e8e8e8;');
    expect(rule).toContain('border-color: #555;');
  });

  test('styles the mobile list-edit FAB like dark mode publish FAB', () => {
    const cssPath = path.join(__dirname, '..', 'darkMode.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const rule = getRuleBody(css, '[data-theme="dark"] .group-edit-fab-button');

    expect(rule).toContain('background: #2a2a2a;');
    expect(rule).toContain('color: #e8e8e8;');
    expect(rule).toContain('border-color: #555;');
  });

  test('defines readable dark mode styles for classic and interactive list-kind pills', () => {
    const cssPath = path.join(__dirname, '..', 'darkMode.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    const privatePillRule = getRuleBody(css, '[data-theme="dark"] .group-type-indicator.private');
    const classicPillRule = getRuleBody(css, '[data-theme="dark"] .group-list-kind-indicator--classic');
    const interactivePillRule = getRuleBody(css, '[data-theme="dark"] .group-list-kind-indicator--interactive');

    expect(privatePillRule).toContain('background: #2a1a2f;');
    expect(privatePillRule).toContain('color: #ce93d8;');
    expect(classicPillRule).toContain('background: #2a1e14;');
    expect(classicPillRule).toContain('color: #c9956a;');
    expect(interactivePillRule).toContain('background: #2a1800;');
    expect(interactivePillRule).toContain('color: #DF7A00;');
  });

  test('styles list kind and target list selects in group dialogs for dark mode', () => {
    const cssPath = path.join(__dirname, '..', 'darkMode.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const rule = getRuleBody(css, '[data-theme="dark"] .group-dialog-field select');
    const focusRule = getRuleBody(css, '[data-theme="dark"] .group-dialog-field select:focus');
    const optionRule = getRuleBody(css, '[data-theme="dark"] .group-dialog-field select option');

    expect(rule).toContain('background: #2a2a2a;');
    expect(rule).toContain('color: #e8e8e8;');
    expect(rule).toContain('border-color: #555;');
    expect(focusRule).toContain('border-color: #b07a40;');
    expect(optionRule).toContain('background: #2a2a2a;');
    expect(optionRule).toContain('color: #e8e8e8;');
  });
});
