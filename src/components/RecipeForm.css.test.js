import fs from 'fs';
import path from 'path';

describe('RecipeForm toolbar CSS layout', () => {
  const cssPath = path.join(__dirname, 'RecipeForm.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  const recipeDetailCssPath = path.join(__dirname, 'RecipeDetail.css');
  const recipeDetailCss = fs.readFileSync(recipeDetailCssPath, 'utf8');
  const darkModeCssPath = path.join(__dirname, '..', 'darkMode.css');
  const darkModeCss = fs.readFileSync(darkModeCssPath, 'utf8');
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

    ['background: transparent;', 'border: none;', 'font-size: 1.5rem;', 'transition: all 0.3s ease;', 'height: 1.5rem;']
      .forEach((declaration) => {
        expect(addImageButtonRule).toContain(declaration);
        expect(shareCopyButtonRule).toContain(declaration);
      });

    expect(addImageButtonRule).toContain('color: #555;');
    expect(shareCopyButtonRule).toContain('color: #555;');

    // add-image button is 50% wider than the share copy button
    expect(addImageButtonRule).toContain('width: 2.25rem;');
    expect(shareCopyButtonRule).toContain('width: 1.5rem;');

    expect(addImageIconRule).toContain('width: 2.25rem;');
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

  test('defines a readable dark mode background for the private list selector', () => {
    const selectRule = getRuleBody(darkModeCss, '[data-theme="dark"] .toolbar-private-list select');
    const optionRule = getRuleBody(darkModeCss, '[data-theme="dark"] .toolbar-private-list select option');

    expect(selectRule).toContain('background: #2a2a2a;');
    expect(selectRule).toContain('color: #e8e8e8;');
    expect(selectRule).toContain('border-color: #555;');
    expect(optionRule).toContain('background: #2a2a2a;');
    expect(optionRule).toContain('color: #e8e8e8;');
  });

  test('styles ingredient and step add buttons as shared icon buttons with distinct variants', () => {
    const addItemButtonRule = getRuleBody(css, '.add-item-button');
    const ingredientButtonRule = getRuleBody(css, '.add-item-button--ingredient');
    const stepButtonRule = getRuleBody(css, '.add-item-button--step');
    const addItemButtonDarkRule = getRuleBody(darkModeCss, '[data-theme="dark"] .add-item-button');

    ['width: 44px;', 'height: 44px;', 'border-radius: 50%;', 'display: flex;', 'justify-content: center;']
      .forEach((declaration) => {
        expect(addItemButtonRule).toContain(declaration);
      });
    expect(addItemButtonRule).toContain('margin: -14px auto 0;');

    expect(ingredientButtonRule).toContain('border-color: #d9c1ab;');
    expect(stepButtonRule).toContain('border-color: #b7cde0;');
    expect(addItemButtonDarkRule).toContain('background: #2a2a2a;');
    expect(addItemButtonDarkRule).toContain('border-color: #555;');
  });

  test('keeps section headings close to the first ingredient and step fields', () => {
    const sectionHeaderRule = getRuleBody(css, '.section-header');
    const firstListItemRule = getRuleBody(css, '.form-section .section-header + .form-list-item');

    expect(sectionHeaderRule).toContain('margin-bottom: 0rem;');
    expect(firstListItemRule).toContain('margin-top: -0.35rem;');
  });
});
