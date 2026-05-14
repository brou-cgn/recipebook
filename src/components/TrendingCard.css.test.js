import fs from 'fs';
import path from 'path';

describe('TrendingCard CSS spacing', () => {
  const getRuleBody = (css, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  test('increases title spacing before meta row by 50%', () => {
    const cssPath = path.join(__dirname, 'TrendingCard.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const titleRule = getRuleBody(css, '.trending-card-title');

    expect(titleRule).toContain('margin: 0 0 0.3rem 0;');
  });
});
