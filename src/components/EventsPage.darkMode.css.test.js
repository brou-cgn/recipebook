import fs from 'fs';
import path from 'path';

describe('EventsPage dark mode FAB styles', () => {
  const getRuleBody = (css, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  test('styles the events-save-fab-button for dark mode', () => {
    const cssPath = path.join(__dirname, '..', 'darkMode.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const rule = getRuleBody(css, '[data-theme="dark"] .events-save-fab-button');

    expect(rule).toContain('background: #2a2a2a;');
    expect(rule).toContain('color: #e8e8e8;');
    expect(rule).toContain('border-color: #555;');
  });

  test('styles the drink-save-fab-button for dark mode', () => {
    const cssPath = path.join(__dirname, '..', 'darkMode.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const rule = getRuleBody(css, '[data-theme="dark"] .drink-save-fab-button');

    expect(rule).toContain('background: #2a2a2a;');
    expect(rule).toContain('color: #e8e8e8;');
    expect(rule).toContain('border-color: #555;');
  });

  test('styles the event-save-fab-button for dark mode', () => {
    const cssPath = path.join(__dirname, '..', 'darkMode.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const rule = getRuleBody(css, '[data-theme="dark"] .event-save-fab-button');

    expect(rule).toContain('background: #2a2a2a;');
    expect(rule).toContain('color: #e8e8e8;');
    expect(rule).toContain('border-color: #555;');
  });
});
