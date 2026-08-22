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
        d="M4 10a6 6 0 1 1 1.76 4.24"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M4 14.5V10h4.5"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default RestartIcon;
