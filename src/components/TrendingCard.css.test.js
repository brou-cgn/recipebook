import fs from 'fs';
import path from 'path';

describe('TrendingCard CSS spacing', () => {
  const cssPath = path.join(__dirname, 'TrendingCard.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  const getRuleBody = (source, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  test('increases title spacing before meta row by 50%', () => {
    const titleRule = getRuleBody(css, '.trending-card-title');

    expect(titleRule).toContain('margin: 0 0 0.3rem 0;');
  });

  test('reduces meta icon font-size by 33%', () => {
    const iconRule = getRuleBody(css, '.trending-card-meta-icon');

    expect(iconRule).toContain('font-size: 0.44rem;');
  });

  test('reduces meta icon image height by 33%', () => {
    const iconImgRule = getRuleBody(css, '.trending-card-meta-icon-img');

    expect(iconImgRule).toContain('height: 0.57rem;');
  });

  test('reduces stars font-size by 33%', () => {
    const starsRule = getRuleBody(css, '.trending-card-stars');

    expect(starsRule).toContain('font-size: 0.44rem;');
  });
});
