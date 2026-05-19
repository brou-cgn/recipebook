import fs from 'fs';
import path from 'path';

describe('RecipeForm toolbar CSS layout', () => {
  const cssPath = path.join(__dirname, 'RecipeForm.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  const getRuleBody = (source, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  test('keeps private list and import controls centered in a single no-wrap row', () => {
    const toolbarRule = getRuleBody(css, '.recipe-form-toolbar');

    expect(toolbarRule).toContain('display: flex;');
    expect(toolbarRule).toContain('align-items: center;');
    expect(toolbarRule).toContain('justify-content: center;');
    expect(toolbarRule).toContain('flex-wrap: nowrap;');
  });
});
