import fs from 'fs';
import path from 'path';

describe('BottomNavigation CSS sizing', () => {
  const getRuleBody = (css, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  test('uses increased minimum height', () => {
    const cssPath = path.join(__dirname, 'BottomNavigation.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const navRule = getRuleBody(css, '.bottom-navigation');

    expect(navRule).toContain('min-height: 77px;');
  });
});
