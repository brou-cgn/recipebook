import fs from 'fs';
import path from 'path';

describe('GroupDetail FAB position CSS', () => {
  const groupDetailCssPath = path.join(__dirname, 'GroupDetail.css');
  const groupDetailCss = fs.readFileSync(groupDetailCssPath, 'utf8');
  const mediaMatch = groupDetailCss.match(/@media\s*\(max-width:\s*768px\)\s*\{([\s\S]*?)\n\}/m);
  const mediaBody = mediaMatch ? mediaMatch[1] : '';

  const getRuleBody = (source, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  it('places the edit FAB on the add-recipe side (bottom right)', () => {
    const editFabRule = getRuleBody(mediaBody, '.group-edit-fab-button');
    expect(editFabRule).toContain('left: auto;');
    expect(editFabRule).toContain('right: 20px;');
  });

  it('keeps the delete FAB at the former edit position (bottom left)', () => {
    const deleteFabPositionRule = getRuleBody(mediaBody, '.delete-fab-button.at-publish-position');
    expect(deleteFabPositionRule).toContain('left: 20px !important;');
  });
});

describe('GroupDetail delete FAB base styles', () => {
  // RecipeDetail/MenuDetail are lazy-loaded; GroupDetail must not depend on
  // their CSS for the delete FAB, or it renders unstyled until one is opened.
  it('imports the shared DeleteFabButton.css itself', () => {
    const source = fs.readFileSync(path.join(__dirname, 'GroupDetail.js'), 'utf8');
    expect(source).toContain("import './DeleteFabButton.css';");
  });

  it('shared stylesheet sizes the FAB and its icon', () => {
    const css = fs.readFileSync(path.join(__dirname, 'DeleteFabButton.css'), 'utf8');
    expect(css).toMatch(/\.delete-fab-button\s*\{[^}]*position:\s*fixed;[^}]*width:\s*44px;/);
    expect(css).toMatch(/\.delete-fab-button \.button-icon-image\s*\{[^}]*width:\s*1\.4rem;/);
  });
});
