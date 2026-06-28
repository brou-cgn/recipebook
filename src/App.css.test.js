import fs from 'fs';
import path from 'path';

describe('App CSS FAB bottom offset selectors', () => {
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

  test('applies bottom-nav offset to recipe and recipe-detail FAB buttons in mobile media query', () => {
    const cssPath = path.join(__dirname, 'App.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const mobileBlock = getMediaBlock(css, '(max-width: 768px)');
    const requiredSelectors = [
      '.App .add-icon-button,',
      '.App .recipe-detail-container .edit-fab-button,',
      '.App .recipe-detail-container .new-version-fab-button,',
      '.App .recipe-detail-container .delete-fab-button,',
      '.App .recipe-detail-container .publish-fab-button,',
      '.App .recipe-detail-container .reset-thumbnail-fab-button,',
    ];

    requiredSelectors.forEach((selector) => {
      expect(mobileBlock).toContain(selector);
    });
    expect(mobileBlock).toContain('bottom: calc(16px + env(safe-area-inset-bottom, 0px) + var(--bottom-nav-offset, 0px));');
  });

  test('keeps reduced-motion selector coverage for recipe and recipe-detail FAB buttons', () => {
    const cssPath = path.join(__dirname, 'App.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const reducedMotionBlock = getMediaBlock(css, '(prefers-reduced-motion: reduce)');

    expect(reducedMotionBlock).toContain('.App .add-icon-button,');
    expect(reducedMotionBlock).toContain('.App .recipe-detail-container .edit-fab-button,');
    expect(reducedMotionBlock).toContain('.App .recipe-detail-container .new-version-fab-button,');
    expect(reducedMotionBlock).toContain('.App .recipe-detail-container .delete-fab-button,');
    expect(reducedMotionBlock).toContain('.App .recipe-detail-container .publish-fab-button,');
    expect(reducedMotionBlock).toContain('.App .recipe-detail-container .reset-thumbnail-fab-button,');
  });
});
