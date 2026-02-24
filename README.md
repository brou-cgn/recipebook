# RecipeBook 🍳

A Progressive Web App (PWA) for managing your favorite recipes. Built with React and optimized for mobile devices.

## Features

- 📱 **Mobile-First Design**: Fully responsive interface optimized for mobile screens
- 💾 **Offline Support**: Works offline with service worker caching
- 📦 **Installable**: Can be installed as a standalone app on mobile and desktop
- 🍽️ **Recipe Management**: Add, edit, and delete recipes
- 🖼️ **Image Support**: Add images to your recipes
- 📝 **Ingredients & Steps**: Organize recipes with detailed ingredient lists and preparation steps
- 🔥 **Firebase Integration**: Cloud-based storage with Firestore and Authentication
- 💾 **Data Persistence**: All recipes are stored in Firebase Firestore with offline support
- 👥 **User Management**: Role-based access control with administrators and different permission levels
- 🔐 **Security**: Password-protected accounts with different access rights

## User Management and Permissions

RecipeBook includes a comprehensive user management system with role-based access control.

### User Roles and Permissions

The application implements a hierarchical permission system with the following roles:

1. **Administrator** 👑
   - Full access to all features
   - Can edit and delete any recipe
   - Can manage users and assign permissions
   - Can delete users
   - Includes all permissions from lower roles

2. **Bearbeiten (Edit)** ✏️
   - Can create and edit their own recipes
   - Can comment on recipes (future feature)
   - Can read all recipes
   - Includes Comment and Read permissions

3. **Kommentieren (Comment)** 💬
   - Can comment on recipes (future feature)
   - Can read all recipes
   - Includes Read permissions

4. **Lesen (Read)** 👁️
   - Can only view recipes
   - Cannot create, edit, or delete recipes

5. **Gast (Guest)** 🚶
   - Temporary access for unregistered users
   - Can only view recipes
   - No persistent account

### Permission Hierarchy

The permission system follows a hierarchical model where higher roles inherit all permissions from lower roles:

```
Administrator → Edit → Comment → Read → Guest
```

- **Edit** permission includes **Comment** and **Read**
- **Comment** permission includes **Read**
- Only **Administrators** can delete recipes
- Only **Administrators** can manage users and permissions

### Getting Started

#### First User Setup

The first user to register automatically becomes an administrator with full permissions. This ensures that there is always at least one administrator who can manage the system.

#### User Registration

New users can register through the login screen:
1. Click "Registrieren" on the login page
2. Fill in your details (first name, last name, email, password)
3. Submit the registration form
4. New users receive **Read** permissions by default

#### Guest Access

Users can also access the application as a guest:
1. Click "Als Gast anmelden" on the login page
2. Guest users can view recipes but cannot edit or create content
3. Guest sessions are temporary and not saved

### User Management (Admin Only)

Administrators can manage users through the Settings menu:

1. Navigate to Settings → Benutzerverwaltung
2. View all registered users with their current permissions
3. Assign or change user roles:
   - Click the 🔐 button next to a user
   - Select the desired permission level
   - Confirm the change
4. Reset user passwords:
   - Click the 🔑 button
   - Set a temporary password
   - User will be prompted to change it on next login
5. Delete users:
   - Click the 🗑️ button
   - Confirm deletion
   - Note: Cannot delete yourself or the last administrator

### Security Notes

- Passwords are hashed before storage (client-side for demo purposes)
- At least one administrator must always exist in the system
- Users cannot delete their own accounts
- Administrators cannot remove admin rights if they are the last admin

## 🌐 Live Demo

The app is live and available at: **[https://brou-cgn.github.io/recipebook](https://brou-cgn.github.io/recipebook)**

## 📦 Deployment

This application is automatically deployed to GitHub Pages when changes are pushed to the `main` branch.

**⚠️ WICHTIG:** Für das Deployment müssen Firebase Secrets als GitHub Actions Secrets konfiguriert werden.  
👉 **[GitHub Secrets Setup Anleitung](GITHUB_SECRETS_SETUP.md)** - Schritt-für-Schritt Anleitung zur Behebung der leeren Seite

### ❓ FAQ:
- **[FAQ.md](FAQ.md)** - 🇩🇪 Häufig gestellte Fragen zur App-Nutzung (Rezepte, Menüs, Küchenseite, Profil, Listen, Kochmodus)

### 📚 Zugriffsanleitungen:
- **[ZUGRIFF_SCHNELLHILFE.md](ZUGRIFF_SCHNELLHILFE.md)** - 🚨 **Schnellhilfe**: Top 5 Probleme & Sofortlösungen (START HIER!)
- **[ZUGRIFF_ANLEITUNG.md](ZUGRIFF_ANLEITUNG.md)** - 📖 **Benutzer-Anleitung**: Wie Sie auf das System zugreifen (für Nicht-Techniker)
- **[ZUGRIFFSPROBLEME_ANALYSE.md](ZUGRIFFSPROBLEME_ANALYSE.md)** - 🔍 **Technische Analyse**: Fehlerbehebung und Diagnostik (für Entwickler/Admins)

### 📋 Deployment & Setup:
- **[GITHUB_SECRETS_SETUP.md](GITHUB_SECRETS_SETUP.md)** - 🔒 Anleitung zum Einrichten der GitHub Secrets (ERFORDERLICH)
- **[PUBLIKATION.md](PUBLIKATION.md)** - 🇩🇪 Vollständiger Leitfaden für die Veröffentlichung (Deutsch, für Laien verständlich)
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - 🇩🇪 Technische Deployment-Details (Deutsch)
- **[VERÖFFENTLICHUNG.md](VERÖFFENTLICHUNG.md)** - 🇩🇪 Zusammenfassung der durchgeführten Schritte

## Getting Started

### Prerequisites

- Node.js (version 14 or higher)
- npm or yarn
- A Firebase account (for database and authentication)

### Firebase Setup

Before running the application, you need to set up Firebase. Follow the detailed guide:

📘 **[Firebase Setup Guide (German)](FIREBASE_SETUP.md)**

Quick setup:
1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Register a web app and get your configuration
3. Copy `.env.example` to `.env.local` and fill in your Firebase credentials
4. Enable Firestore Database and Email/Password Authentication in Firebase Console

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

## 📸 OCR-Import

RecipeBook features powerful OCR (Optical Character Recognition) to digitize recipes from photos or scanned images. Simply photograph a recipe from a cookbook, magazine, or handwritten card, and the app will automatically extract the text and parse it into a structured recipe.

### Features

- **📷 Camera Capture**: Use your device camera to photograph recipes directly
- **📁 File Upload**: Upload existing recipe images (JPG, PNG)
- **🌍 Multi-language Support**: Recognizes both German and English recipes
- **✏️ Text Editing**: Review and correct OCR results before importing
- **🔄 Offline Support**: Works completely offline after initial setup (PWA mode)

### How to Use OCR Import

1. **Start OCR Scan**
   - Navigate to the recipe form
   - Click "📸 Rezept scannen" button
   - Choose between camera capture or file upload

2. **Capture or Upload Image**
   - **Camera**: Grant camera permissions and photograph your recipe
   - **File Upload**: Select a recipe image from your device

3. **Select Language and Scan**
   - Choose the language of your recipe (🇩🇪 Deutsch or 🇬🇧 English)
   - Click Scan to process the image
   - This helps improve OCR accuracy

4. **Review and Edit**
   - Wait for OCR processing (typically 5-15 seconds)
   - Review the recognized text in the editable text field
   - Correct any OCR errors manually
   - The parser will automatically detect sections:
     - Recipe title (first line)
     - Ingredients (Zutaten/Ingredients)
     - Preparation steps (Zubereitung/Instructions/Directions)
     - Metadata (Portionen/Servings, Kochdauer/Time)

5. **Import Recipe**
   - Click "Übernehmen" to import the parsed recipe
   - The recipe form will be pre-filled with all extracted data
   - Review and save your recipe

### Best Practices for OCR

For best results when scanning recipes:

- **Good Lighting**: Ensure the recipe is well-lit without shadows or glare
- **High Contrast**: Clear text against a light background works best
- **Focus**: Keep the camera steady and ensure text is in focus
- **Orientation**: Hold the device parallel to the recipe page
- **Full Text**: Include section headers like "Zutaten" and "Zubereitung"

### Supported Recipe Formats

The OCR parser recognizes these common recipe structures:

**German Format:**
```
Rezeptname

Portionen: 4
Kochdauer: 30

Zutaten

400g Zutat 1
200g Zutat 2
2 EL Zutat 3

Zubereitung

1. Schritt eins
2. Schritt zwei
3. Schritt drei
```

**English Format:**
```
Recipe Name

Servings: 4
Time: 30 minutes

Ingredients

2 cups ingredient 1
1 cup ingredient 2
1 tbsp ingredient 3

Instructions

1. First step
2. Second step
3. Third step
```

### Example

Try OCR scanning with our test image:
- [Recipe Sample SVG](public/test-assets/recipe-sample.svg) - A simple German recipe card
- [Recipe Sample Text](public/test-assets/recipe-sample.txt) - Text representation

### Technical Details

For developers interested in the OCR implementation:

- **OCR Engine**: Tesseract.js v7 (client-side)
- **Languages**: German (`deu`) and English (`eng`)
- **Processing**: All OCR processing happens in the browser (no server required)
- **Caching**: Language data cached for offline use (~2-4MB per language)
- **Parser**: Smart recipe parser with section detection and metadata extraction

Detailed documentation:
- [OCR Service API Documentation](OCR_SERVICE.md)
- [OCR Scan Modal Component Documentation](OCR_SCAN_MODAL.md)
- [AI OCR Platforms Analysis](AI_OCR_PLATTFORMEN_ANALYSE.md) - Analysis of AI-enhanced OCR options
- [AI OCR Integration Guide](AI_OCR_INTEGRATION.md) - How to integrate AI OCR

### AI-Enhanced OCR (Optional)

For significantly improved OCR accuracy, the app supports AI-powered OCR through Google Gemini Vision:
- **90-95% accuracy** (vs. 70-80% with Tesseract)
- **Structured data extraction**: Automatically extracts title, ingredients, steps, cuisine, category
- **Handwriting support**: Better recognition of handwritten recipes
- **Free tier**: ~10,000+ requests/month

See [AI OCR Analysis](AI_OCR_PLATTFORMEN_ANALYSE.md) for details and [Integration Guide](AI_OCR_INTEGRATION.md) for implementation.

### Troubleshooting

**OCR not accurate?**
- Ensure good image quality and lighting
- Try different language settings
- Edit the recognized text manually before importing

**Camera not working?**
- Check browser camera permissions
- HTTPS is required for camera access
- Try file upload as an alternative

**Processing too slow?**
- Ensure good internet connection for initial language data download
- After first use, works offline in PWA mode

## Nährwerte & OpenFoodFacts

RecipeBook can automatically calculate nutritional values for recipes using the
[OpenFoodFacts](https://world.openfoodfacts.org/) open food database.

### Supported Nutrients (per portion)

| Field | Description |
|---|---|
| Kalorien (kcal) | Energy |
| Protein (g) | Protein |
| Fett (g) | Total fat |
| Kohlenhydrate (g) | Total carbohydrates |
| davon Zucker (g) | of which sugars |
| Ballaststoffe (g) | Dietary fibre |
| Salz (g) | Salt |

### How to Use

1. Open any recipe and click the **Nährwerte** button in the metadata bar.
2. Click **🔍 Automatisch berechnen (OpenFoodFacts)** to look up each ingredient.
3. The fields are filled automatically. Review and correct any values manually.
4. Click **Speichern** to save the nutritional data to the recipe.

### Notes

- No API key is required – OpenFoodFacts is a free, open database.
- Calculations are approximate and depend on whether each ingredient is found in the database.
- Values are computed server-side via a Firebase Cloud Function to avoid CORS issues.
- Data source: **OpenFoodFacts** (https://world.openfoodfacts.org), licensed under
  [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/).

## PWA Features

### Installation

The app can be installed on:

- **Mobile devices** (iOS/Android): Tap the "Add to Home Screen" option in your browser
- **Desktop** (Chrome/Edge): Click the install icon in the address bar

### Offline Functionality

Once installed, RecipeBook works completely offline thanks to:

- Service Worker caching of app shell and assets
- Firestore offline persistence (IndexedDB)
- PWA architecture with Workbox

## Technology Stack

- **React 19**: Modern UI library
- **Create React App**: Build tooling and configuration
- **Firebase**: Backend infrastructure
  - **Firestore**: NoSQL cloud database with offline support
  - **Firebase Authentication**: User management and authentication
- **Workbox**: Service worker and offline caching
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

## Firebase Configuration

RecipeBook uses Firebase for cloud storage, authentication, and offline functionality. 

### Setting Up Your Own Firebase Project

For detailed instructions on setting up Firebase, see **[FIREBASE_SETUP.md](FIREBASE_SETUP.md)** (German).

### Key Firebase Features Used

1. **Firestore Database**
   - Real-time recipe synchronization
   - User data management
   - Menu and favorites storage
   - Offline persistence with IndexedDB

2. **Firebase Authentication**
   - Email/Password authentication
   - Role-based access control
   - User session management

3. **Security**
   - Environment variables for sensitive configuration
   - Firestore security rules
   - Client-side password hashing

### Environment Variables

The application uses environment variables to keep Firebase credentials secure:

```env
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_auth_domain
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
# ... see .env.example for all variables
```

**Important**: Never commit `.env.local` to version control. Use `.env.example` as a template.

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## License

This project is open source and available under the MIT License.

## Author

brou-cgn

---

Enjoy cooking! 👨‍🍳👩‍🍳
