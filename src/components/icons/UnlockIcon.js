import React from 'react';

const UnlockIcon = ({ color = 'currentColor', size = 24 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="5"
        y="11"
        width="14"
        height="10"
        rx="2"
        stroke={color}
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M8 11V7a4 4 0 0 1 7.5-2"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
};

export default UnlockIcon;
