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
