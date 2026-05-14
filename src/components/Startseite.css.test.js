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
    const carouselItemRule = getRuleBody(mediaBody, '.startseite-carousel-item');
    const imageRule = getRuleBody(mediaBody, '.startseite-carousel-item .trending-card-image');

    expect(carouselItemRule).toContain('flex: 0 0 calc((100% - 2rem) / 3);');
    expect(carouselItemRule).toContain('width: calc((100% - 2rem) / 3);');
    expect(imageRule).toContain('height: 132px;');
  });

  test('uses 4 columns and taller images on desktop', () => {
    const mediaBody = getMediaBody(css, 'min-width: 1200px');
    const carouselItemRule = getRuleBody(mediaBody, '.startseite-carousel-item');
    const imageRule = getRuleBody(mediaBody, '.startseite-carousel-item .trending-card-image');

    expect(carouselItemRule).toContain('flex: 0 0 calc((100% - 3rem) / 4);');
    expect(carouselItemRule).toContain('width: calc((100% - 3rem) / 4);');
    expect(imageRule).toContain('height: 148px;');
  });

  test('reduces spacing above "mehr" button container', () => {
    const mehrContainerRule = getRuleBody(css, '.startseite-mehr-container');

    expect(mehrContainerRule).toContain('margin-top: 0.4rem;');
  });
});
