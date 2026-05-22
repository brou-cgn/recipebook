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

describe('RecipeDetail CSS mobile FAB clearance', () => {
  test('adds padding-bottom to steps section on mobile so last step is not hidden behind FAB', () => {
    const cssPath = path.join(__dirname, 'RecipeDetail.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    // Find all @media (max-width: 768px) blocks and check that at least one
    // contains the .recipe-section--steps padding-bottom rule.
    const mediaRegex = /@media\s*\(max-width:\s*768px\)\s*\{/g;
    let match;
    let found = false;
    while ((match = mediaRegex.exec(css)) !== null) {
      // Extract the block by counting braces from the opening brace position
      const start = match.index + match[0].length;
      let depth = 1;
      let i = start;
      while (i < css.length && depth > 0) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') depth--;
        i++;
      }
      const block = css.slice(start, i - 1);
      if (/\.recipe-section--steps\s*\{[^}]*padding-bottom:\s*5rem/.test(block)) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});
