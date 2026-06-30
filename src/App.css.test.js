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

  test('defines shared bottom navigation sizing custom properties on the app root', () => {
    const cssPath = path.join(__dirname, 'App.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toContain('--bottom-nav-min-height: 77px;');
    expect(css).toContain('--bottom-nav-vertical-padding: 0.4rem;');
    expect(css).toContain('--bottom-nav-total-vertical-padding: 0.8rem;');
    expect(css).toContain('--bottom-nav-height: calc(');
    expect(css).toContain('--bottom-spacing: 0px;');
  });

  test('applies bottom spacing to mobile page containers via a shared custom property', () => {
    const cssPath = path.join(__dirname, 'App.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const mobileBlock = getMediaBlock(css, '(max-width: 768px)');

    expect(mobileBlock).toContain('.App .startseite-container,');
    expect(mobileBlock).toContain('.App .recipe-list-container,');
    expect(mobileBlock).toContain('.App .menu-list-container,');
    expect(mobileBlock).toContain('.App .group-list-container,');
    expect(mobileBlock).toContain('.App .group-detail-container,');
    expect(mobileBlock).toContain('.App .kueche-container,');
    expect(mobileBlock).toContain('.App .app-calls-container,');
    expect(mobileBlock).toContain('.App .meine-kuechenstars-container');
    expect(mobileBlock).toContain('.App .settings-container');
    expect(mobileBlock).toContain('.App .personal-data-page');
    expect(mobileBlock).toContain('padding-bottom: calc(20px + var(--bottom-spacing, 0px));');
    expect(mobileBlock).toContain('padding-bottom: calc(1rem + var(--bottom-spacing, 0px));');
    expect(mobileBlock).toContain('padding-bottom: calc(1.5rem + var(--bottom-spacing, 0px));');
  });

  test('applies bottom-nav offset to shared and recipe-detail FAB buttons in mobile media query', () => {
    const cssPath = path.join(__dirname, 'App.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const mobileBlock = getMediaBlock(css, '(max-width: 768px)');
    const requiredSelectors = [
      '.App .startseite-fab-button,',
      '.App .kueche-fab-button,',
      '.App .menu-favorites-filter-button,',
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

  test('keeps recipe and menu overview FAB buttons at fixed hidden-nav position', () => {
    const cssPath = path.join(__dirname, 'App.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const mobileBlock = getMediaBlock(css, '(max-width: 768px)');

    expect(mobileBlock).toContain('.App .add-icon-button,');
    expect(mobileBlock).toContain('.App .add-menu-fab-button {');
    expect(mobileBlock).toContain('bottom: calc(16px + env(safe-area-inset-bottom, 0px));');
  });

  test('keeps recipe overview carousel at fixed hidden-nav position', () => {
    const cssPath = path.join(__dirname, 'App.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const smallMobileBlock = getMediaBlock(css, '(max-width: 480px)');

    expect(smallMobileBlock).toContain('.App .sort-carousel {');
    expect(smallMobileBlock).toContain('bottom: calc(16px + env(safe-area-inset-bottom, 0px));');
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
