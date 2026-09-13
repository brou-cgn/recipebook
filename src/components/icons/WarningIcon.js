import React from 'react';

const WarningIcon = ({ color = 'currentColor', size = 24 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 4L21 20H3L12 4Z"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M12 10.5V14.5"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17" r="1" fill={color} stroke="none" />
    </svg>
  );
};

export default WarningIcon;
