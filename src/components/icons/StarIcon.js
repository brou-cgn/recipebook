import React from 'react';

const StarIcon = ({ color = 'currentColor', size = '1em', filled = true }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      data-testid={filled ? 'star-icon' : 'star-icon-empty'}
      style={{ verticalAlign: '-0.125em' }}
    >
      <path
        d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
      />
    </svg>
  );
};

export default StarIcon;
