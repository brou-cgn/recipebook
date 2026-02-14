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
