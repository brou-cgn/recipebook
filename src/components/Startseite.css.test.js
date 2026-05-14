import fs from 'fs';
import path from 'path';

describe('Startseite carousel desktop layout CSS', () => {
  const cssPath = path.join(__dirname, 'Startseite.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  test('uses larger container and 3 columns from tablet width', () => {
    expect(css).toContain('@media (min-width: 768px)');
    expect(css).toContain('max-width: 1120px;');
    expect(css).toContain('flex: 0 0 calc((100% - 2rem) / 3);');
    expect(css).toContain('width: calc((100% - 2rem) / 3);');
    expect(css).toContain('height: 132px;');
  });

  test('uses 4 columns and taller images on desktop', () => {
    expect(css).toContain('@media (min-width: 1200px)');
    expect(css).toContain('flex: 0 0 calc((100% - 3rem) / 4);');
    expect(css).toContain('width: calc((100% - 3rem) / 4);');
    expect(css).toContain('height: 148px;');
  });
});
