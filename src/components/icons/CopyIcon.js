import React from 'react';

// Zwei versetzte Blätter: „Duplizieren“ in einer Zeile oder Karte (RowIconButton).
const CopyIcon = ({ color = 'currentColor', size = '1em' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path
        d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default CopyIcon;
