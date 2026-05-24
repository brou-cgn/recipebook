import fs from 'fs';
import path from 'path';

describe('GroupDetail FAB position CSS', () => {
  const cssPath = path.join(__dirname, 'GroupDetail.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  const mediaMatch = css.match(/@media\s*\(max-width:\s*768px\)\s*\{([\s\S]*?)\n\}/m);
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

  it('places the delete FAB at the former edit-FAB position (bottom left)', () => {
    const deleteFabRule = getRuleBody(mediaBody, '.group-detail-delete-fab-button');
    expect(deleteFabRule).toContain('left: 20px !important;');
  });
});
