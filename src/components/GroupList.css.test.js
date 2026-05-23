import fs from 'fs';
import path from 'path';

describe('GroupList CSS layout', () => {
  const getRuleBody = (css, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  test('left-aligns the "Meine Mise en Place" heading in the header', () => {
    const cssPath = path.join(__dirname, 'GroupList.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const headerRule = getRuleBody(css, '.group-list-header');
    const headingRule = getRuleBody(css, '.group-list-header h2');

    expect(headerRule).toContain('display: flex;');
    expect(headingRule).toContain('text-align: left;');
    expect(headingRule).toContain('flex: 1;');
  });

  test('keeps the close button centered with transparent light mode chrome', () => {
    const cssPath = path.join(__dirname, 'GroupList.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const closeButtonRule = getRuleBody(css, '.group-list-close-btn');
    const closeButtonHoverRule = getRuleBody(css, '.group-list-close-btn:hover');

    expect(closeButtonRule).toContain('display: inline-flex;');
    expect(closeButtonRule).toContain('align-items: center;');
    expect(closeButtonRule).toContain('justify-content: center;');
    expect(closeButtonRule).toContain('background: transparent;');
    expect(closeButtonRule).toContain('border: none;');
    expect(closeButtonRule).toContain('-webkit-tap-highlight-color: transparent;');
    expect(closeButtonRule).toContain('touch-action: manipulation;');
    expect(closeButtonHoverRule).toContain('background: #f0f0f0;');
  });
});
