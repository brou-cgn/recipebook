import React, { useState, useRef, useEffect } from 'react';
import './RecipeImageCarousel.css';
import { getDarkModePreference } from '../utils/customLists';

/**
 * A reusable image carousel with scroll-snap, dot indicators, and desktop arrow navigation.
 * Supports lazy loading via IntersectionObserver (with native loading="lazy" as enhancement).
 *
 * Lazy Loading Strategy:
 *   - Uses IntersectionObserver with dynamic viewport-based rootMargin
 *   - Preloads images 1.0-1.5 viewports ahead (responsive)
 *   - Native loading="lazy" as additional enhancement
 *
 * Props:
 *   images        - Array of image objects with at least a `url` property (required).
 *                   Objects may also carry `thumbnailUrl` (light) and
 *                   `thumbnailUrlDark` (dark mode) for faster list-view loading.
 *   altText       - Alt text for the images (required)
 *   className     - Additional CSS class(es) for the wrapper div (optional)
 *   onImageClick  - Callback when a slide image is clicked (optional)
 *   useThumbnails - When true, prefer mode-aware thumbnail over `url` for each slide
 *                   (optional, default false). Use in list/overview contexts for faster loading.
 */
function RecipeImageCarousel({ images, altText, className = '', onImageClick, useThumbnails = false }) {
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [loadedImages, setLoadedImages] = useState({});
  const [isVisible, setIsVisible] = useState(false);
  const [isDark, setIsDark] = useState(() => getDarkModePreference());
  const trackRef = useRef(null);
  const containerRef = useRef(null);
  const scrollTimeoutRef = useRef(null);
  const lengthRef = useRef(images.length);
  lengthRef.current = images.length;

  // Reset to first slide when the images array changes (by content or size)
  const imagesKey = images.map(img => img.url).join(',');
  useEffect(() => {
    setCarouselIndex(0);
    setLoadedImages({});
    if (trackRef.current) {
      trackRef.current.scrollLeft = 0;
    }
  }, [imagesKey]);

  // Intersection Observer: defer image loading until the carousel is near the viewport.
  // Preload distance is responsive: 1.0× viewport height on mobile (≤768 px) to conserve
  // data, and 1.5× on tablet/desktop so images are ready before the user scrolls to them.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!('IntersectionObserver' in window)) {
      setIsVisible(true);
      return;
    }

    const viewportHeight = window.innerHeight;
    const isMobile = window.innerWidth <= 768;
    const multiplier = isMobile ? 1.0 : 1.5;
    const preloadDistance = viewportHeight * multiplier;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          observer.unobserve(container);
        }
      },
      { rootMargin: `${preloadDistance}px 0px` }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handler = (e) => setIsDark(Boolean(e.detail?.isDark));
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

  const hasMultiple = images.length > 1;

  const scrollToIndex = (index) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: index * track.offsetWidth, behavior: 'smooth' });
    setCarouselIndex(index);
  };

  const handleScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      const newIndex = Math.round(track.scrollLeft / track.offsetWidth);
      const len = lengthRef.current;
      if (newIndex >= 0 && newIndex < len) {
        setCarouselIndex(newIndex);
      }
    }, 30);
  };

  const handlePrev = (e) => {
    e.stopPropagation();
    const newIndex = (carouselIndex - 1 + images.length) % images.length;
    scrollToIndex(newIndex);
  };

  const handleNext = (e) => {
    e.stopPropagation();
    const newIndex = (carouselIndex + 1) % images.length;
    scrollToIndex(newIndex);
  };

  const safeIndex = Math.min(carouselIndex, images.length - 1);

  return (
    <div className={`recipe-image-carousel ${className}`.trim()} ref={containerRef}>
      <div
        className="ric-track"
        ref={trackRef}
        onScroll={hasMultiple ? handleScroll : undefined}
      >
        {images.map((img, idx) => {
          const effectiveThumbnail = isDark
            ? (img.thumbnailUrlDark || img.thumbnailUrl)
            : img.thumbnailUrl;
          const imageSrc = useThumbnails && effectiveThumbnail ? effectiveThumbnail : img.url;

          return (
            <div
              key={idx}
              className="ric-slide"
              onClick={onImageClick}
            >
              <div className={`ric-placeholder${loadedImages[idx] ? ' ric-placeholder--hidden' : ''}`} />
              {isVisible && (
                <img
                  src={imageSrc}
                  alt={altText}
                  loading="lazy"
                  className={`ric-image${loadedImages[idx] ? ' ric-image--loaded' : ''}`}
                  onLoad={() => setLoadedImages(prev => ({ ...prev, [idx]: true }))}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}
            </div>
          );
        })}
      </div>
      {hasMultiple && (
        <>
          <button
            className="ric-arrow ric-arrow--prev"
            onClick={handlePrev}
            aria-label="Vorheriges Bild"
          >
            ‹
          </button>
          <button
            className="ric-arrow ric-arrow--next"
            onClick={handleNext}
            aria-label="Nächstes Bild"
          >
            ›
          </button>
          <div className="ric-dots">
            {images.map((_, dotIdx) => (
              <button
                key={dotIdx}
                className={`ric-dot${dotIdx === safeIndex ? ' ric-dot--active' : ''}`}
                onClick={(e) => { e.stopPropagation(); scrollToIndex(dotIdx); }}
                aria-label={`Bild ${dotIdx + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default RecipeImageCarousel;
