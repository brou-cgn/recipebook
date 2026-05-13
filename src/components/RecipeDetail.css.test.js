import fs from 'fs';
import path from 'path';

describe('RecipeDetail CSS thumbnail reset icon sizing', () => {
  const getRuleBody = (css, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  test('limits reset-thumbnail icon to the same maximum size as publish icon', () => {
    const cssPath = path.join(__dirname, 'RecipeDetail.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const publishIconRule = getRuleBody(css, '.publish-fab-button .button-icon-image');
    const resetIconRule = getRuleBody(css, '.reset-thumbnail-fab-button .button-icon-image');

    expect(publishIconRule).toContain('width: 1.4rem;');
    expect(publishIconRule).toContain('height: 1.4rem;');
    expect(resetIconRule).toContain('max-width: 1.4rem;');
    expect(resetIconRule).toContain('max-height: 1.4rem;');
  });
});
