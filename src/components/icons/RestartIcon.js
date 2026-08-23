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
        d="M12.8 5.15A5.6 5.6 0 1 1 5.71 6.4"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M3.33 7.46L5.71 6.4L5.08 8.92"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default RestartIcon;
