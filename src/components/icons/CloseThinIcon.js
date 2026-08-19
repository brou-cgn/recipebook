import React from 'react';

// Thin "×" used by DeleteRowButton: 13x13 viewport, 1.5 stroke, round caps.
const CloseThinIcon = ({ color = 'currentColor', size = 13 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 13 13"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M1.5 1.5l10 10M11.5 1.5l-10 10"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
};

export default CloseThinIcon;
