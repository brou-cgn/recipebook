# Firestore Security Rules

This file contains security rules for the Firestore database that enforce access control for recipes, menus, and other collections.

## Overview

The security rules implement the following access control:

### Recipes
- **Read (Public recipes)**: Any authenticated user
- **Read (Private/Draft recipes)**: Only administrators and the recipe author
- **Create**: Any authenticated user
- **Update**: Only the recipe author or administrators
- **Delete**: Only the recipe author or administrators

### Menus
- **Read (Public menus)**: Any authenticated user
- **Read (Private menus)**: Only the menu creator or administrators
- **Create**: Any authenticated user
- **Update**: Only the menu creator or administrators
- **Delete**: Only the menu creator or administrators

### Users
- **Read**: Users can read their own profile, administrators can read all profiles
- **Update**: Users can update their own profile
- **Create/Delete**: Only administrators

### Favorites (User subcollections)
- **Read/Write**: Only the user who owns the favorites

### Settings and Custom Lists
- **Read**: Any authenticated user
- **Write**: Only administrators

## Deployment

To deploy these security rules to Firebase:

1. Make sure you have the Firebase CLI installed:
   ```bash
   npm install -g firebase-tools
   ```

2. Login to Firebase:
   ```bash
   firebase login
   ```

3. Initialize Firebase in the project (if not already done):
   ```bash
   firebase init
   ```
   Select Firestore when prompted and use the existing `firestore.rules` file.

4. Deploy the security rules:
   ```bash
   firebase deploy --only firestore:rules
   ```

## Testing

You can test the security rules locally using the Firebase Emulator:

```bash
firebase emulators:start
```

## Important Notes

- These rules work in conjunction with the client-side filtering implemented in the application
- Client-side filtering provides immediate UX feedback
- Server-side rules (Firestore) provide the actual security enforcement
- Both layers are necessary for proper security and user experience

## Draft Recipe Visibility

The key security feature implemented here is the restriction of draft recipe visibility:

```javascript
allow read: if isAuthenticated() && 
               (!resource.data.isPrivate || 
                isAdmin() || 
                isAuthor(resource.data.authorId));
```

This ensures that:
1. Public recipes (`isPrivate: false` or undefined) can be read by any authenticated user
2. Private/Draft recipes (`isPrivate: true`) can only be read by:
   - Administrators
   - The author of the recipe

This matches the client-side filtering implemented in `src/utils/recipeFirestore.js`.
