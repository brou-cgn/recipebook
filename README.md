# RecipeBook 🍳

A Progressive Web App (PWA) for managing your favorite recipes. Built with React and optimized for mobile devices.

## Features

- 📱 **Mobile-First Design**: Fully responsive interface optimized for mobile screens
- 💾 **Offline Support**: Works offline with service worker caching
- 📦 **Installable**: Can be installed as a standalone app on mobile and desktop
- 🍽️ **Recipe Management**: Add, edit, and delete recipes
- 🖼️ **Image Support**: Add images to your recipes
- 📝 **Ingredients & Steps**: Organize recipes with detailed ingredient lists and preparation steps
- 💿 **Local Storage**: All recipes are saved locally in your browser

## Getting Started

### Prerequisites

- Node.js (version 14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/brou-fob/recipebook.git
   cd recipebook
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

### Building for Production

To create a production build:

```bash
npm run build
```

The optimized files will be in the `build` folder. You can deploy these to any static hosting service.

To serve the production build locally:

```bash
npm install -g serve
serve -s build
```

## Usage

### Viewing Recipes

- The home screen displays all your recipes in a card layout
- Tap any recipe card to view full details including ingredients and preparation steps

### Adding a Recipe

1. Click the "+ Add Recipe" button on the home screen
2. Fill in the recipe details:
   - Recipe title (required)
   - Image URL (optional)
   - Ingredients (add as many as needed)
   - Preparation steps (add as many as needed)
3. Click "Save Recipe" to add it to your collection

### Editing a Recipe

1. Open a recipe by tapping on its card
2. Click the "✏️ Edit" button
3. Modify the recipe details
4. Click "Update Recipe" to save changes

### Deleting a Recipe

1. Open a recipe by tapping on its card
2. Click the "🗑️ Delete" button
3. Confirm the deletion

## PWA Features

### Installation

The app can be installed on:

- **Mobile devices** (iOS/Android): Tap the "Add to Home Screen" option in your browser
- **Desktop** (Chrome/Edge): Click the install icon in the address bar

### Offline Functionality

Once installed, RecipeBook works completely offline thanks to:

- Service Worker caching of app shell and assets
- LocalStorage for recipe data persistence

## Technology Stack

- **React 19**: Modern UI library
- **Create React App**: Build tooling and configuration
- **Workbox**: Service worker and offline caching
- **LocalStorage API**: Client-side data persistence
- **CSS3**: Responsive styling with Flexbox and Grid

## Browser Support

RecipeBook works on all modern browsers:

- Chrome/Edge (recommended for PWA features)
- Firefox
- Safari
- Mobile browsers (iOS Safari, Chrome Mobile)

## Sample Recipes

The app comes with 3 sample recipes to help you get started:

1. Spaghetti Carbonara
2. Classic Margherita Pizza
3. Chocolate Chip Cookies

You can edit or delete these and add your own recipes.

## Development

### Available Scripts

- `npm start` - Run development server
- `npm run build` - Create production build
- `npm test` - Run tests
- `npm run eject` - Eject from Create React App (one-way operation)

### Project Structure

```
recipebook/
├── public/
│   ├── index.html
│   ├── manifest.json
│   └── ...
├── src/
│   ├── components/
│   │   ├── Header.js
│   │   ├── RecipeList.js
│   │   ├── RecipeDetail.js
│   │   └── RecipeForm.js
│   ├── App.js
│   ├── index.js
│   └── serviceWorkerRegistration.js
└── package.json
```

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## License

This project is open source and available under the MIT License.

## Author

brou-fob

---

Enjoy cooking! 👨‍🍳👩‍🍳
