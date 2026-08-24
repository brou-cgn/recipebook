import React from 'react';

// Refresh/redo arrow used to restart a stuck or failed import job.
const RestartIcon = ({ color = 'currentColor', size = 16 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M13.7 3.59A7.4 7.4 0 1 1 4.33 5.24"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M1.32 6.58L4.33 5.24L3.53 8.44"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default RestartIcon;
