import React from 'react';

const CupIcon = ({ color = 'currentColor', size = 24 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6 3h12l-1.2 15.2A2 2 0 0 1 14.8 20H9.2a2 2 0 0 1-2-1.8L6 3z"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M7 9h10" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
};

export default CupIcon;
