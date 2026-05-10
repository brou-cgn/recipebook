import fs from 'fs';
import path from 'path';

describe('Tagesmenu CSS sizing for kachel menu button', () => {
  const getRuleBody = (css, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  test('uses reduced 70% dimensions for wrapper, icon, and trigger image', () => {
    const cssPath = path.join(__dirname, 'Tagesmenu.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const wrapperRule = getRuleBody(css, '.tagesmenu-kachel-menu-wrapper');
    const iconRule = getRuleBody(css, '.tagesmenu-kachel-context-icon');
    const triggerImgRule = getRuleBody(css, '.tagesmenu-kachel-context-trigger-img');

    expect(wrapperRule).toContain('width: 1.75rem;');
    expect(wrapperRule).toContain('height: 1.75rem;');
    expect(iconRule).toContain('font-size: 1.05rem;');
    expect(triggerImgRule).toContain('width: 1.05rem;');
    expect(triggerImgRule).toContain('height: 1.05rem;');
  });
});
