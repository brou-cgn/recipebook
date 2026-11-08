// Geschenk (Wichteln): Paket mit Schleife, Strichzeichnung wie die übrigen Icons.
const GiftIcon = ({ color = 'currentColor', size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
    data-testid="gift-icon"
  >
    <path
      d="M4 11h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9ZM3 7.5h18V11H3V7.5ZM12 7.5V21M12 7.5c-1.2-2.6-4.6-3.6-5.4-1.6-.7 1.7 2.6 1.6 5.4 1.6Zm0 0c1.2-2.6 4.6-3.6 5.4-1.6.7 1.7-2.6 1.6-5.4 1.6Z"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default GiftIcon;
