import fs from 'fs';
import path from 'path';

describe('GroupList CSS layout', () => {
  const getRuleBody = (css, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  test('Variante A: Kopf aus dem gemeinsamen Rahmen, Titel links (Unterseite.css)', () => {
    const css = fs.readFileSync(path.join(__dirname, 'Unterseite.css'), 'utf8');
    expect(getRuleBody(css, '.unterseite-kopf__zeile')).toContain('display: flex;');
    expect(getRuleBody(css, '.unterseite-kopf .unterseite-kopf__titel h2')).toContain('text-align: left;');
    expect(getRuleBody(css, '.unterseite-kopf__titel')).toContain('flex: 1;');
  });

  test('shows full card descriptions without line clamp and keeps card height content-driven', () => {
    const cssPath = path.join(__dirname, 'GroupList.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const descriptionRule = getRuleBody(css, '.group-card .group-card-description');
    const cardRule = getRuleBody(css, '.group-card');

    expect(descriptionRule).toContain('margin: 0 0 0.5rem;');
    expect(descriptionRule).toContain('font-size: 0.85rem;');
    expect(descriptionRule).toContain('color: var(--color-text-body);');
    expect(descriptionRule).toContain('line-height: 1.35;');
    expect(descriptionRule).not.toContain('-webkit-line-clamp');
    expect(descriptionRule).not.toContain('overflow: hidden;');
    expect(cardRule).not.toContain('height:');
  });
});
