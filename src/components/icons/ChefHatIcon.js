import React from 'react';

const ChefHatIcon = ({ color = 'currentColor', size = 24 }) => {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <path 
        d="M18 8C18 6.67392 17.4732 5.40215 16.5355 4.46447C15.5979 3.52678 14.3261 3 13 3C12.3675 3 11.7551 3.14346 11.1968 3.41005C10.6384 3.67664 10.1495 4.06015 9.76256 4.53431C9.3756 5.00848 9.09776 5.56241 8.94645 6.15831C8.79514 6.75421 8.77392 7.37643 8.88416 7.98042C7.29394 8.22893 6 9.4904 6 11V13C6 13.5523 6.44772 14 7 14H17C17.5523 14 18 13.5523 18 13V8Z" 
        fill={color}
      />
      <path 
        d="M8 14V19C8 19.5523 8.44772 20 9 20H15C15.5523 20 16 19.5523 16 19V14" 
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
};

export default ChefHatIcon;
