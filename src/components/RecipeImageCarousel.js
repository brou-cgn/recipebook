import React, { useState, useRef, useEffect } from 'react';
import './RecipeImageCarousel.css';

/**
 * A reusable image carousel with scroll-snap, dot indicators, and desktop arrow navigation.
 *
 * Props:
 *   images      - Array of image objects with at least a `url` property (required)
 *   altText     - Alt text for the images (required)
 *   className   - Additional CSS class(es) for the wrapper div (optional)
 *   onImageClick - Callback when a slide image is clicked (optional)
 */
function RecipeImageCarousel({ images, altText, className = '', onImageClick }) {
  const [carouselIndex, setCarouselIndex] = useState(0);
  const trackRef = useRef(null);
  const scrollTimeoutRef = useRef(null);
  const lengthRef = useRef(images.length);
  lengthRef.current = images.length;

  // Reset to first slide when the images array changes (by content or size)
  const imagesKey = images.map(img => img.url).join(',');
  useEffect(() => {
    setCarouselIndex(0);
    if (trackRef.current) {
      trackRef.current.scrollLeft = 0;
    }
  }, [imagesKey]);

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
    <div className={`recipe-image-carousel ${className}`.trim()}>
      <div
        className="ric-track"
        ref={trackRef}
        onScroll={hasMultiple ? handleScroll : undefined}
      >
        {images.map((img, idx) => (
          <div
            key={idx}
            className="ric-slide"
            onClick={onImageClick}
          >
            <img src={img.url} alt={altText} />
          </div>
        ))}
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
