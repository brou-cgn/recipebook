import React from 'react';

/** Kettenglied: steht für einen Link ohne Vorschaubild. */
const LinkIcon = ({ color = 'currentColor', size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M10 13.5a4.5 4.5 0 0 0 6.36.36l2.83-2.83a4.5 4.5 0 0 0-6.36-6.36l-1.42 1.41"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M14 10.5a4.5 4.5 0 0 0-6.36-.36l-2.83 2.83a4.5 4.5 0 0 0 6.36 6.36l1.41-1.41"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default LinkIcon;
