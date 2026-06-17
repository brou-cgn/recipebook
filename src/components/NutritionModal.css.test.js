import fs from 'fs';
import path from 'path';

const getRuleBody = (css, selector) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  return match ? match[1] : '';
};

describe('NutritionModal table spacing styles', () => {
  let css = '';

  beforeAll(() => {
    const cssPath = path.join(__dirname, 'NutritionModal.css');
    css = fs.readFileSync(cssPath, 'utf8');
  });

  test('keeps the nutrition table at full width while separating portion and per-100g columns', () => {
    const tableRule = getRuleBody(css, '.nutrition-values-table');
    const labelRule = getRuleBody(css, '.nutrition-values-table__label-col');
    const portionHeaderRule = getRuleBody(css, '.nutrition-values-table__amount-col--portion');
    const per100gHeaderRule = getRuleBody(css, '.nutrition-values-table__amount-col--per100g');
    const portionValueRule = getRuleBody(css, '.nutrition-values-table__amount--portion');
    const per100gValueRule = getRuleBody(css, '.nutrition-values-table__amount--per100g');

    expect(tableRule).toContain('width: 100%;');
    expect(tableRule).toContain('table-layout: fixed;');
    expect(labelRule).toContain('width: 44%;');
    expect(portionHeaderRule).toContain('width: 24%;');
    expect(portionHeaderRule).toContain('padding-right: 0.9rem;');
    expect(portionHeaderRule).toContain('white-space: nowrap;');
    expect(per100gHeaderRule).toContain('width: 32%;');
    expect(per100gHeaderRule).toContain('padding-left: 0.35rem;');
    expect(portionValueRule).toContain('padding-right: 0.9rem;');
    expect(per100gValueRule).toContain('padding-left: 0.35rem;');
  });

  test('reduces the added spacing slightly on small screens to keep headers readable', () => {
    expect(css).toContain('@media (max-width: 480px)');
    expect(css).toContain('.nutrition-values-table__amount-col--portion,\n  .nutrition-values-table__amount--portion {\n    padding-right: 0.65rem;');
    expect(css).toContain('.nutrition-values-table__amount-col--per100g,\n  .nutrition-values-table__amount--per100g {\n    padding-left: 0.25rem;');
  });
});
