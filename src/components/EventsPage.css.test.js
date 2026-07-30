import fs from 'fs';
import path from 'path';

describe('EventsPage FAB CSS', () => {
  const getRuleBody = (css, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  const getMediaBlock = (css, query) => {
    const mediaStart = css.indexOf(`@media ${query}`);
    if (mediaStart === -1) return '';
    const braceStart = css.indexOf('{', mediaStart);
    let depth = 1;
    let i = braceStart + 1;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth += 1;
      if (css[i] === '}') depth -= 1;
      i += 1;
    }
    return css.slice(braceStart + 1, i - 1);
  };

  test('hides the overview add FAB by default on desktop', () => {
    const cssPath = path.join(__dirname, 'EventsPage.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const rule = getRuleBody(css, '.events-add-fab-button');

    expect(rule).toContain('display: none;');
  });

  test('shows the overview add FAB with the menu FAB styling on mobile', () => {
    const cssPath = path.join(__dirname, 'EventsPage.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const mobileBlock = getMediaBlock(css, '(max-width: 768px)');
    const rule = getRuleBody(mobileBlock, '.events-add-fab-button');

    expect(rule).toContain('position: fixed;');
    expect(rule).toContain('right: 20px;');
    expect(rule).toContain('width: 56px;');
    expect(rule).toContain('height: 56px;');
    expect(rule).toContain('background: white;');
    expect(rule).toContain('border: 1px solid #ddd;');
    expect(rule).toContain('opacity: 0.85;');
    expect(rule).toContain('display: flex;');
    expect(rule).toContain('font-size: 1.1rem;');
  });

  test('uses the same pressed animation as the menu overview FAB', () => {
    const cssPath = path.join(__dirname, 'EventsPage.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const pressedRule = getRuleBody(css, '.events-add-fab-button.pressed');

    expect(pressedRule).toContain('transform: scale(1.15);');
    expect(pressedRule).toContain('box-shadow: 0 8px 18px rgba(0, 0, 0, 0.3);');
  });

  test('checkbox and range slider use green accent-color matching the guest card signal color', () => {
    const cssPath = path.join(__dirname, 'EventsPage.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toContain('.events-category-checkbox input[type="checkbox"]');
    expect(css).toContain('.events-form-field input[type="range"]');
    expect(css).toContain('accent-color: #2F5D50;');
  });
});
