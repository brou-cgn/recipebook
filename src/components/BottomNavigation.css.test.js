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

  test('uses larger icon sizing', () => {
    const cssPath = path.join(__dirname, 'BottomNavigation.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const iconRule = getRuleBody(css, '.bottom-navigation__icon svg');

    expect(iconRule).toContain('width: 28px;');
    expect(iconRule).toContain('height: 28px;');
  });

  test('uses dark background in dark mode', () => {
    const cssPath = path.join(__dirname, 'BottomNavigation.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const darkRule = getRuleBody(css, '[data-theme="dark"] .bottom-navigation');

    expect(darkRule).toContain('background: #1E1E1C;');
  });

  test('uses updated dark mode tab color', () => {
    const cssPath = path.join(__dirname, 'BottomNavigation.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const darkTabRule = getRuleBody(css, '[data-theme="dark"] .bottom-navigation__tab');

    expect(darkTabRule).toContain('color: #E0D5C7;');
  });
});
