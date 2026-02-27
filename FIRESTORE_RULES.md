# Firestore Security Rules

This file documents the security rules for the Firestore database that enforce access control for all collections.

## Roles

| Role | Description |
|------|-------------|
| `admin` | Full access to everything |
| `edit` | Can create and edit own content |
| `comment` | Currently equivalent to `read` |
| `read` | Read-only access |
| `guest` | Not logged in (no Firebase Auth) |

## Helper Functions

The following helper functions are defined in `firestore.rules`:

- `isAuthenticated()` – Returns `true` if the user is logged in
- `getUserData()` – Returns the current user's document from `/users/{uid}`
- `isAdmin()` – Returns `true` if the user has the `admin` role
- `isEdit()` – Returns `true` if the user has the `edit` role (or is admin)
- `isAuthor(authorId)` – Returns `true` if the current user is the document's author
- `isGroupMember(groupId)` – Returns `true` if the current user is a member of the group
- `isGroupOwner(groupId)` – Returns `true` if the current user is the owner of the group
- `isPublicGroup(groupId)` – Returns `true` if the group type is `public`
- `isPrivateGroup(groupId)` – Returns `true` if the group type is `private`

## Permission Concept per Collection

### Recipes (`/recipes/{recipeId}`)

> **Important:** Every recipe must have a `groupId`. Recipes without a `groupId` cannot be created or read (except via share link).

| Operation | Who |
|-----------|-----|
| Read (share link) | Anyone, including guests |
| Read (public group, non-draft) | All authenticated users |
| Read (public group, draft) | `admin` only |
| Read (private group, non-draft) | `admin` (always), or authenticated group member |
| Read (private group, draft) | `admin` only |
| Create | `admin`, `edit` (groupId required) |
| Update | `admin` (all), `edit` (own) |
| Delete | `admin` only |

### Menus (`/menus/{menuId}`)

| Operation | Who |
|-----------|-----|
| Read (share link) | Anyone, including guests |
| Read (non-draft) | All authenticated users |
| Read (draft) | `admin` (all), `edit` (own) |
| Create | `admin`, `edit` |
| Update | `admin` (all), `edit` (own) |
| Delete | `admin` (all), `edit` (own) |

### Groups (`/groups/{groupId}`)

| Operation | Who |
|-----------|-----|
| Read (public group) | `admin` only |
| Read (private group) | `admin` (all), `edit` + `read` (member or owner) |
| Create | `admin` always, `edit` (private groups only) |
| Update | `admin` (all), `edit` + `read` (own groups) |
| Delete | `admin` (all), `edit` (own = group owner) |

### Users (`/users/{userId}`)

| Operation | Who |
|-----------|-----|
| Read | All authenticated users |
| Create | `admin` or guest (for self-registration) |
| Update | `admin` (all), any authenticated user (own profile) |
| Delete | `admin` only |

### Favorites & Menu Favorites (subcollections)

- `/users/{userId}/favorites/{favoriteId}` – Read/Write: authenticated user (own only)
- `/users/{userId}/menuFavorites/{favoriteId}` – Read/Write: authenticated user (own only)

### Settings (`/settings/{settingId}`)

| Operation | Who |
|-----------|-----|
| Read | All authenticated users |
| Create / Update / Delete | `admin` only |

### Custom Lists (`/customLists/{listId}`)

| Operation | Who |
|-----------|-----|
| Read | All authenticated users |
| Create / Update / Delete | `admin` only |

### FAQs (`/faqs/{faqId}`)

| Operation | Who |
|-----------|-----|
| Read | All authenticated users |
| Create / Update / Delete | `admin` only |

### Shopping Lists (`/shoppingLists/{listId}`)

| Operation | Who |
|-----------|-----|
| Read | All authenticated users |
| Create | `admin`, `edit` |
| Update | `admin` (all), `edit` (own) |
| Delete | `admin` only |

### Category Images (`/categoryImages/{imageId}`)

| Operation | Who |
|-----------|-----|
| Read | All authenticated users |
| Create / Update / Delete | `admin` only |

### AI Scan Limits (`/aiScanLimits/{limitId}`)

| Operation | Who |
|-----------|-----|
| Read | `admin`, `edit` |
| Create / Update / Delete | `admin` only |

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
