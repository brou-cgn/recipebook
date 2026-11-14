import fs from 'fs';
import path from 'path';

// Sheet „Was kochst du dazu?“ (Vorhaben „Parallel kochen“)
const css = fs.readFileSync(path.join(__dirname, 'CookingAddRecipeSheet.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const getRuleBody = (source, selector) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`(?:^|\\})\\s*${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  return match ? match[1] : '';
};

describe('CookingAddRecipeSheet CSS', () => {
  const tablet = (css.match(/@media \(min-width: 744px\) and \(min-height: 600px\) \{([\s\S]*?\})\s*\}/) || [])[1] || '';

  test('auf dem Handy ein Bottom-Sheet über die ganze Breite', () => {
    expect(getRuleBody(css, '.add-recipe-sheet-root')).toContain('justify-content: flex-end;');
    expect(getRuleBody(css, '.add-recipe-sheet')).toContain('border-radius: 24px 24px 0 0;');
  });

  test('auf dem Tablet zentriert, oben verankert und höchstens 560 px breit (Feinschliff Tablet, Punkt 8)', () => {
    expect(tablet).not.toBe('');
    const root = getRuleBody(tablet, '.add-recipe-sheet-root');
    expect(root).toContain('justify-content: flex-start;');
    expect(root).toContain('align-items: center;');
    expect(root).toContain('padding: 96px 24px 24px;');
    const sheet = getRuleBody(tablet, '.add-recipe-sheet');
    expect(sheet).toContain('max-width: 560px;');
    expect(sheet).toContain('border-radius: 24px;');
    expect(getRuleBody(tablet, '.add-recipe-sheet-grabber')).toContain('display: none;');
  });

  test('keine Hex-Farben, nur Tokens', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
