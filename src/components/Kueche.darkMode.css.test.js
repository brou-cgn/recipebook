import fs from 'fs';
import path from 'path';

describe('Kueche dark mode styles', () => {
  const read = (...parts) => fs.readFileSync(path.join(__dirname, ...parts), 'utf8');
  const getRuleBody = (css, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  test('styles the Küche FAB button over color tokens', () => {
    const rule = getRuleBody(read('Kueche.css'), '.kueche-fab-button');

    expect(rule).toContain('background: var(--color-surface);');
    expect(rule).toContain('color: var(--color-text);');
    expect(rule).toContain('border: 1px solid var(--color-border);');
  });

  test('defines dark values for the tokens the Küche uses', () => {
    const tokens = read('..', 'tokens.css');
    const dark = getRuleBody(tokens, '[data-theme="dark"]');

    expect(dark).toContain('--color-surface: #2a2a2a;');
    expect(dark).toContain('--color-text: #e8e8e8;');
    expect(dark).toContain('--color-border: #555;');
    expect(dark).toContain('--color-surface-card: #1e1e1e;');
    expect(dark).toContain('--color-text-strong: #e8e8e8;');
    expect(dark).toContain('--color-text-muted: #aaa;');
  });
});
