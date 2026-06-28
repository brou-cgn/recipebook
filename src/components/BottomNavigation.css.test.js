import fs from 'fs';
import path from 'path';

describe('BottomNavigation CSS sizing', () => {
  test('uses increased minimum height', () => {
    const cssPath = path.join(__dirname, 'BottomNavigation.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const navRule = css.match(/\.bottom-navigation\s*\{([\s\S]*?)\}/m)?.[1] ?? '';

    expect(navRule).toContain('min-height: 77px;');
  });
});
