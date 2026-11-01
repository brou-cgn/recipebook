import React from 'react';

// Pfeil nach oben oder unten: Hinweis „fälliges Rezept außer Sicht“ im Karussell (iPad quer) und in der Schiene
const ArrowVerticalIcon = ({ up = false, size = 18, strokeWidth = 2.6 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {up ? <path d="M12 19V5M6 11l6-6 6 6" /> : <path d="M12 5v14M6 13l6 6 6-6" />}
  </svg>
);

export default ArrowVerticalIcon;
