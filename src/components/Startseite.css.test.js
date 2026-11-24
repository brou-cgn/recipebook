import fs from 'fs';
import path from 'path';

describe('Startseite container CSS', () => {
  const cssPath = path.join(__dirname, 'Startseite.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const getMediaBody = (source, mediaQuery) => {
    const escapedMedia = escapeRegex(mediaQuery);
    const match = source.match(new RegExp(`@media\\s*\\(${escapedMedia}\\)\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
    return match ? match[1] : '';
  };
  const getRuleBody = (source, selector) => {
    const escapedSelector = escapeRegex(selector);
    const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  test('uses larger container from tablet width', () => {
    const mediaBody = getMediaBody(css, 'min-width: 768px');
    const containerRule = getRuleBody(mediaBody, '.startseite-container');

    expect(containerRule).toContain('max-width: 1120px;');
  });

  test('defines the Alltagsklassiker picker overlay rule', () => {
    const overlayRule = getRuleBody(css, '.startseite-alltagsklassiker-picker-overlay');

    expect(overlayRule).toContain('position: fixed;');
    expect(overlayRule).toContain('inset: 0;');
    expect(overlayRule).toContain('justify-content: center;');
    expect(overlayRule).toContain('z-index: 2000;');
  });
});

describe('StartseitenKarussell carousel desktop layout CSS', () => {
  const cssPath = path.join(__dirname, 'StartseitenKarussell.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const getMediaBody = (source, mediaQuery) => {
    const escapedMedia = escapeRegex(mediaQuery);
    const match = source.match(new RegExp(`@media\\s*\\(${escapedMedia}\\)\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
    return match ? match[1] : '';
  };
  const getRuleBody = (source, selector) => {
    const escapedSelector = escapeRegex(selector);
    const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  test('uses 3 columns from tablet width', () => {
    const mediaBody = getMediaBody(css, 'min-width: 768px');
    const sectionRule = getRuleBody(mediaBody, '.startseite-trending-section');

    expect(sectionRule).toContain('--spalten: 3;');
    expect(sectionRule).toContain('--anschnitt: 14px;');
    expect(sectionRule).toContain('--abstand: 16px;');
    expect(sectionRule).toContain('--card-image-h: 128px;');
  });

  test('uses 4 columns and taller images on desktop', () => {
    const mediaBody = getMediaBody(css, 'min-width: 1200px');
    const sectionRule = getRuleBody(mediaBody, '.startseite-trending-section');

    expect(sectionRule).toContain('--spalten: 4;');
    expect(sectionRule).toContain('--anschnitt: 16px;');
    expect(sectionRule).toContain('--card-image-h: 144px;');
  });

  test('sizes tiles so the neighbouring tiles peek in at the edges', () => {
    const sectionRule = getRuleBody(css, '.startseite-trending-section');
    const carouselRule = getRuleBody(css, '.startseite-carousel');
    const itemRule = getRuleBody(css, '.startseite-carousel-item');
    const imageRule = getRuleBody(css, '.startseite-carousel-item .trending-card-image');

    expect(sectionRule).toContain('--rand: 20px;');
    expect(sectionRule).toContain('--anschnitt: 12px;');
    expect(sectionRule).toContain('--spalten: 2;');
    expect(carouselRule).toContain('padding-left: var(--rand);');
    expect(carouselRule).toContain('scroll-padding-inline: calc(var(--anschnitt) + var(--abstand));');
    expect(itemRule).toContain(
      '--breite: calc((100% + var(--rand) - 2 * var(--anschnitt) - (var(--spalten) + 1) * var(--abstand)) / var(--spalten));'
    );
    expect(itemRule).toContain('flex: 0 0 var(--breite);');
    expect(imageRule).toContain('height: var(--card-image-h);');
  });

  test('keeps the gap after the last tile with a spacer instead of padding-right', () => {
    const spacerRule = getRuleBody(css, '.startseite-carousel::after');

    expect(spacerRule).toContain('flex: 0 0 calc(var(--rand) - var(--abstand));');
  });

  test('lets the carousel reach the screen edge when it has tiles', () => {
    const randlosRule = getRuleBody(css, '.startseite-carousel-wrap--randlos');

    expect(randlosRule).toContain('margin-left: calc(-1 * var(--rand));');
    expect(randlosRule).toContain('margin-right: calc(-1 * var(--rand));');
  });

  test('shows the arrows only with a mouse from tablet width', () => {
    const arrowRule = getRuleBody(css, '.startseite-carousel-pfeil');
    const mediaBody = getMediaBody(css, 'hover: hover) and (min-width: 768px');

    expect(arrowRule).toContain('display: none;');
    expect(arrowRule).toContain('width: 44px;');
    expect(getRuleBody(mediaBody, '.startseite-carousel-pfeil')).toContain('display: flex;');
  });

  test('uses the accent text token for the "mehr" link (Tech-Check A13)', () => {
    expect(getRuleBody(css, '.startseite-mehr-btn')).toContain('color: var(--color-accent-text);');
  });

  test('reduces spacing above "mehr" button container', () => {
    const mehrContainerRule = getRuleBody(css, '.startseite-mehr-container');

    expect(mehrContainerRule).toContain('margin-top: 0.4rem;');
  });

  test('prevents empty-state text overflow from escaping carousel wrapper', () => {
    const wrapRule = getRuleBody(css, '.startseite-carousel-wrap');

    expect(wrapRule).toContain('overflow: hidden;');
  });
});
