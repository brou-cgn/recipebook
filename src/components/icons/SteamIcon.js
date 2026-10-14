import React from 'react';

const SteamIcon = ({ color = 'currentColor', size = '1em' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      style={{ verticalAlign: '-0.125em' }}
    >
      <path
        d="M7 4c-1.5 2 1.5 3 0 5s1.5 3 0 5M12 4c-1.5 2 1.5 3 0 5s1.5 3 0 5M17 4c-1.5 2 1.5 3 0 5s1.5 3 0 5M5 19h14"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default SteamIcon;
