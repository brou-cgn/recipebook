/** Placeholder photo (inline SVG) so thumbnails and the preview work without a network request. */
const PHOTO = (color) => `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="${color}"/>` +
  '<circle cx="600" cy="400" r="220" fill="rgba(255,255,255,0.35)"/></svg>',
)}`;

/** Example recipe for template thumbnails and as the preview when no recipe is chosen. */
export const SAMPLE_RECIPE = {
  id: 'sample',
  title: 'Spaghetti Bolognese',
  portionen: 4,
  kochdauer: 45,
  schwierigkeit: 2,
  kulinarik: ['Italienisch'],
  createdAt: new Date(2025, 0, 2),
  images: [
    { url: PHOTO('#e9a23b'), isDefault: true },
    { url: PHOTO('#c8713a') },
    { url: PHOTO('#8aa05a') },
    { url: PHOTO('#a65b4a') },
  ],
  ingredients: [
    { type: 'heading', text: 'Sauce' },
    '500 g Hackfleisch',
    '2 Zwiebeln',
    '2 EL Olivenöl',
    '400 g Tomaten',
    { type: 'heading', text: 'Pasta' },
    '400 g Spaghetti',
    'Salz',
  ],
  steps: [
    'Zwiebeln würfeln und im Öl glasig anbraten.',
    'Hackfleisch zugeben und krümelig braten.',
    { type: 'heading', text: 'Fertigstellen' },
    'Tomaten zugeben und 30 Minuten köcheln lassen.',
    'Spaghetti in Salzwasser garen und mit der Sauce servieren.',
  ],
};
