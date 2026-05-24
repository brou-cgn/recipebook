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
    expect(closeButtonRule).toContain('-webkit-appearance: none;');
    expect(closeButtonRule).toContain('appearance: none;');
    expect(closeButtonRule).toContain('-webkit-tap-highlight-color: transparent;');
    expect(closeButtonRule).toContain('touch-action: manipulation;');
    expect(closeButtonHoverRule).toContain('background: #f0f0f0;');
  });

  test('shows full card descriptions without line clamp and keeps card height content-driven', () => {
    const cssPath = path.join(__dirname, 'GroupList.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const descriptionRule = getRuleBody(css, '.group-card-description');
    const cardRule = getRuleBody(css, '.group-card');

    expect(descriptionRule).toContain('margin: 0 0 0.5rem;');
    expect(descriptionRule).toContain('font-size: 0.85rem;');
    expect(descriptionRule).toContain('color: #666;');
    expect(descriptionRule).toContain('line-height: 1.35;');
    expect(descriptionRule).not.toContain('-webkit-line-clamp');
    expect(descriptionRule).not.toContain('overflow: hidden;');
    expect(cardRule).not.toContain('height:');
  });
});
