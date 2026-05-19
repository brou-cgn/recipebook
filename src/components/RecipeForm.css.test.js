import fs from 'fs';
import path from 'path';

describe('RecipeForm toolbar CSS layout', () => {
  const cssPath = path.join(__dirname, 'RecipeForm.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  const recipeDetailCssPath = path.join(__dirname, 'RecipeDetail.css');
  const recipeDetailCss = fs.readFileSync(recipeDetailCssPath, 'utf8');
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

  test('styles add-image button like share copy button from recipe detail view', () => {
    const addImageButtonRule = getRuleBody(css, '.add-image-btn');
    const shareCopyButtonRule = getRuleBody(recipeDetailCss, '.share-copy-url-button');
    const addImageIconRule = getRuleBody(css, '.add-image-icon-img');
    const shareCopyIconRule = getRuleBody(recipeDetailCss, '.copy-link-icon-img');

    ['background: transparent;', 'border: none;', 'font-size: 1.5rem;', 'transition: all 0.3s ease;', 'width: 1.5rem;', 'height: 1.5rem;']
      .forEach((declaration) => {
        expect(addImageButtonRule).toContain(declaration);
        expect(shareCopyButtonRule).toContain(declaration);
      });

    expect(addImageButtonRule).toContain('color: #555;');
    expect(shareCopyButtonRule).toContain('color: #555;');

    expect(addImageIconRule).toContain('width: 1.5rem;');
    expect(addImageIconRule).toContain('height: 1.5rem;');
    expect(shareCopyIconRule).toContain('width: 1.5rem;');
    expect(shareCopyIconRule).toContain('height: 1.5rem;');
  });

  test('keeps title label spacing aligned with standard form label spacing', () => {
    const formGroupHeaderRule = getRuleBody(css, '.form-group-header');
    const formGroupLabelRule = getRuleBody(css, '.form-group label');

    expect(formGroupHeaderRule).toContain('align-items: flex-end;');
    expect(formGroupHeaderRule).toContain('margin-bottom: 0.5rem;');
    expect(formGroupLabelRule).toContain('margin-bottom: 0.5rem;');
  });
});
