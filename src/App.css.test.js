import fs from 'fs';
import path from 'path';

describe('App CSS FAB bottom offset selectors', () => {
  test('applies bottom-nav offset to recipe and recipe-detail FAB buttons on mobile', () => {
    const cssPath = path.join(__dirname, 'App.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toContain('.App .add-icon-button,');
    expect(css).toContain('.App .recipe-detail-container .edit-fab-button,');
    expect(css).toContain('.App .recipe-detail-container .new-version-fab-button,');
    expect(css).toContain('.App .recipe-detail-container .delete-fab-button,');
    expect(css).toContain('.App .recipe-detail-container .publish-fab-button,');
    expect(css).toContain('.App .recipe-detail-container .reset-thumbnail-fab-button,');
  });
});
