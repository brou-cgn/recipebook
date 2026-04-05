import React from 'react';
import { render, screen, act } from '@testing-library/react';
import RecipeImageCarousel from './RecipeImageCarousel';

const sampleImages = [
  { url: 'https://example.com/img1.jpg', thumbnailUrl: 'https://example.com/thumb1.jpg' },
  { url: 'https://example.com/img2.jpg', thumbnailUrl: 'https://example.com/thumb2.jpg' },
];

// ---- IntersectionObserver mock helpers ----

let intersectionCallback = null;

function setupIntersectionObserver() {
  intersectionCallback = null;
  global.IntersectionObserver = jest.fn((cb) => {
    intersectionCallback = cb;
    return {
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    };
  });
}

function triggerIntersection(isIntersecting = true) {
  if (intersectionCallback) {
    act(() => {
      intersectionCallback([{ isIntersecting }]);
    });
  }
}

// ---- window dimension helpers ----

function setViewport(width, height) {
  Object.defineProperty(window, 'innerWidth',  { writable: true, configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: height });
}

// ---- tests ----

describe('RecipeImageCarousel – lazy loading / IntersectionObserver', () => {
  beforeEach(() => {
    setupIntersectionObserver();
    setViewport(1024, 800); // default: desktop
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders without crashing', () => {
    render(<RecipeImageCarousel images={sampleImages} altText="Test" />);
  });

  test('images are NOT rendered before intersection', () => {
    render(<RecipeImageCarousel images={sampleImages} altText="Test" />);
    expect(screen.queryByAltText('Test')).not.toBeInTheDocument();
  });

  test('images ARE rendered after intersection', () => {
    render(<RecipeImageCarousel images={sampleImages} altText="Test" />);
    triggerIntersection(true);
    expect(screen.getAllByAltText('Test')).toHaveLength(sampleImages.length);
  });

  test('non-intersecting entry does not reveal images', () => {
    render(<RecipeImageCarousel images={sampleImages} altText="Test" />);
    triggerIntersection(false);
    expect(screen.queryByAltText('Test')).not.toBeInTheDocument();
  });

  test('uses desktop multiplier (1.5) for rootMargin on wide screens', () => {
    setViewport(1024, 800);
    render(<RecipeImageCarousel images={sampleImages} altText="Test" />);

    const [[, options]] = global.IntersectionObserver.mock.calls;
    expect(options.rootMargin).toBe('1200px 0px'); // 800 * 1.5
  });

  test('uses mobile multiplier (1.0) for rootMargin on narrow screens', () => {
    setViewport(375, 667);
    render(<RecipeImageCarousel images={sampleImages} altText="Test" />);

    const [[, options]] = global.IntersectionObserver.mock.calls;
    expect(options.rootMargin).toBe('667px 0px'); // 667 * 1.0
  });

  test('uses 768 px as mobile breakpoint (exactly 768 → mobile)', () => {
    setViewport(768, 1024);
    render(<RecipeImageCarousel images={sampleImages} altText="Test" />);

    const [[, options]] = global.IntersectionObserver.mock.calls;
    expect(options.rootMargin).toBe('1024px 0px'); // 1024 * 1.0
  });

  test('uses desktop multiplier for widths > 768 px', () => {
    setViewport(769, 1024);
    render(<RecipeImageCarousel images={sampleImages} altText="Test" />);

    const [[, options]] = global.IntersectionObserver.mock.calls;
    expect(options.rootMargin).toBe('1536px 0px'); // 1024 * 1.5
  });

  test('falls back to visible when IntersectionObserver is unavailable', () => {
    delete global.IntersectionObserver;
    render(<RecipeImageCarousel images={sampleImages} altText="Test" />);
    expect(screen.getAllByAltText('Test')).toHaveLength(sampleImages.length);
  });

  test('cleanup: disconnect is called on unmount', () => {
    const disconnectMock = jest.fn();
    global.IntersectionObserver = jest.fn(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: disconnectMock,
    }));

    const { unmount } = render(<RecipeImageCarousel images={sampleImages} altText="Test" />);
    unmount();
    expect(disconnectMock).toHaveBeenCalled();
  });

  test('useThumbnails renders thumbnailUrl instead of full url after intersection', () => {
    render(<RecipeImageCarousel images={sampleImages} altText="Test" useThumbnails={true} />);
    triggerIntersection(true);
    const imgs = screen.getAllByAltText('Test');
    imgs.forEach((img, idx) => {
      expect(img.getAttribute('src')).toBe(sampleImages[idx].thumbnailUrl);
    });
  });
});
