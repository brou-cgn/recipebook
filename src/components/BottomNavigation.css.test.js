import fs from 'fs';
import path from 'path';

describe('BottomNavigation CSS sizing', () => {
  const getRuleBody = (css, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  test('uses shared custom properties for navigation height and safe-area padding', () => {
    const cssPath = path.join(__dirname, 'BottomNavigation.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const navRule = getRuleBody(css, '.bottom-navigation');

    expect(navRule).toContain('min-height: var(--bottom-nav-min-height, 77px);');
    expect(navRule).toContain('var(--bottom-nav-vertical-padding, 0.4rem)');
    expect(navRule).toContain('env(safe-area-inset-bottom, 0px)');
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

  test('uses beige label color for inactive tabs in dark mode', () => {
    const cssPath = path.join(__dirname, 'BottomNavigation.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const darkLabelRule = getRuleBody(css, '[data-theme="dark"] .bottom-navigation__label');

    expect(darkLabelRule).toContain('color: #E0D5C7;');
  });

  test('highlights the active tab and pill item in orange in dark mode', () => {
    const cssPath = path.join(__dirname, 'BottomNavigation.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const darkActiveTabRule = getRuleBody(
      css,
      '[data-theme="dark"] .bottom-navigation__tab--active,\n[data-theme="dark"] .bottom-navigation__tab--active .bottom-navigation__label'
    );
    const darkActivePillRule = getRuleBody(
      css,
      '[data-theme="dark"] .bottom-navigation-pill__item--active'
    );

    expect(darkActiveTabRule).toContain('color: #D4820A;');
    expect(darkActivePillRule).toContain('color: #D4820A;');
  });
});
