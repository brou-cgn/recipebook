import fs from 'fs';
import path from 'path';

describe('Tagesmenu CSS sizing for kachel menu button', () => {
  test('uses reduced 70% dimensions for wrapper, icon, and trigger image', () => {
    const cssPath = path.join(__dirname, 'Tagesmenu.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toMatch(/\.tagesmenu-kachel-menu-wrapper\s*\{[^}]*width:\s*1\.75rem;[^}]*height:\s*1\.75rem;/s);
    expect(css).toMatch(/\.tagesmenu-kachel-context-icon\s*\{[^}]*font-size:\s*1\.05rem;/s);
    expect(css).toMatch(/\.tagesmenu-kachel-context-trigger-img\s*\{[^}]*width:\s*1\.05rem;[^}]*height:\s*1\.05rem;/s);
  });
});
