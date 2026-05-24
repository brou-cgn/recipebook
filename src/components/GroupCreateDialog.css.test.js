import fs from 'fs';
import path from 'path';

const getRuleBody = (css, selector) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  return match ? match[1] : '';
};

describe('GroupCreateDialog CSS scoping', () => {
  test('scopes member list border to dialog context only', () => {
    const cssPath = path.join(__dirname, 'GroupCreateDialog.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const scopedRule = getRuleBody(css, '.group-dialog .group-member-list');

    expect(scopedRule).toContain('border: 1px solid #eee;');
    expect(css).not.toMatch(/(^|\n)\.group-member-list\s*\{/);
  });
});
