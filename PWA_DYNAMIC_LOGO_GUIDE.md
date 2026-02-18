# PWA Dynamic App Logo - Implementation Guide

## Overview

This implementation allows the PWA (Progressive Web App) to use a custom app logo that can be changed at runtime through the Settings menu. The logo will be used for:
- PWA installation icon (Add to Home Screen)
- App manifest
- Apple Touch Icon

## How It Works

### 1. Service Worker Interception
The service worker intercepts requests for:
- `/manifest.json` - Dynamically generates the manifest with the custom logo
- `/logo192.png` - Generates a 192x192px PNG from the custom logo
- `/logo512.png` - Generates a 512x512px PNG from the custom logo

### 2. Settings Storage
When a user uploads a new app logo:
1. The image is stored in Firestore (as base64)
2. The settings are sent to the service worker via `postMessage`
3. The service worker stores the settings in IndexedDB for offline access
4. Future requests for manifest/icons use the IndexedDB-stored logo

### 3. PNG Transparency Support
- The image compression function automatically preserves PNG transparency
- When a PNG file is uploaded, it's saved as PNG (not converted to JPEG)
- The service worker generates the icons as PNG to maintain transparency

## Testing Instructions

### Desktop Testing (Chrome/Edge)
1. Navigate to Settings
2. Upload a custom app logo (preferably a PNG with transparency)
3. Click "Save"
4. Open DevTools > Application > Manifest
5. Verify the manifest shows your custom logo
6. Open DevTools > Network, search for "logo192.png" or "logo512.png"
7. Refresh the page and verify the icons are served dynamically

### Mobile Testing (iOS Safari)

#### Installing the PWA
1. Navigate to the app in Safari
2. Upload a custom app logo in Settings
3. Click the Share button
4. Select "Add to Home Screen"
5. Verify the icon shows your custom logo (not the React default)

#### Important iOS Notes
⚠️ **iOS Safari caches PWA manifests aggressively!**

If you already have the app installed and change the logo:
1. **Remove the old PWA** from your home screen completely
2. **Close all Safari tabs** for the app
3. **Clear Safari cache** (Settings > Safari > Clear History and Website Data)
4. **Reinstall the PWA** using "Add to Home Screen"

iOS Safari caches:
- The manifest.json file
- The app icons
- Service worker state

This is why the logo might not update immediately for existing installations.

### Android Testing (Chrome)
1. Navigate to the app in Chrome
2. Upload a custom app logo in Settings
3. Click the three-dot menu
4. Select "Install app" or "Add to Home screen"
5. Verify the icon shows your custom logo

Android Chrome handles updates better than iOS:
- Updates may appear after 24-48 hours
- Or after clearing Chrome cache and reinstalling

## Image Guidelines

### Recommended Specifications
- **Format**: PNG with transparent background (recommended)
- **Alternative formats**: JPEG, WebP, GIF also supported
- **Size**: 512x512 pixels or larger (will be scaled down)
- **Max file size**: 5MB
- **Aspect ratio**: Square (1:1)

### Transparency Best Practices
⚠️ **Important for maskable icons**:
- PWA icons with `purpose: "any maskable"` may be displayed with rounded corners or circular masks
- Avoid large transparent borders around your logo
- Keep important content within the "safe zone" (center 80% of the image)
- Test on both iOS and Android to ensure proper appearance

### Why PNG?
- Supports transparency (alpha channel)
- No quality loss from compression
- Better appearance on different colored backgrounds
- iOS and Android both support PNG transparency in PWA icons

## Troubleshooting

### "Logo not updating on home screen"
**iOS:**
1. Delete the app from home screen
2. Close ALL Safari tabs
3. Clear Safari cache (Settings > Safari > Clear History)
4. Wait 10 seconds
5. Reinstall the PWA

**Android:**
1. Uninstall the PWA
2. Clear Chrome cache (Settings > Privacy > Clear browsing data)
3. Reinstall the PWA

### "Logo appears with white/black background"
- Ensure you uploaded a PNG file (not JPEG)
- Check that the original image has transparency
- Re-upload the image if it was converted to JPEG

### "Logo appears cut off or too small"
- Your logo has too much transparent padding
- Create a new version with less margin around the actual logo content
- Ensure important parts are in the center 80% of the image

## Technical Implementation

### Files Modified
1. `src/service-worker.js` - Added dynamic manifest/icon serving
2. `src/utils/imageUtils.js` - Added PNG transparency preservation
3. `src/utils/faviconUtils.js` - Added service worker notification
4. `src/components/Settings.js` - Added service worker update messaging and UI hints

### Key Functions
- `resizeImage(base64, targetSize)` - Resizes images in service worker
- `notifyServiceWorker(settings)` - Sends settings to service worker
- `compressImage(base64, maxWidth, maxHeight, quality, preserveTransparency)` - Compresses with optional PNG preservation

### Browser Compatibility
- **Chrome/Edge**: Full support ✅
- **Firefox**: Full support ✅
- **Safari (iOS)**: Full support ✅ (with caching caveats)
- **Safari (macOS)**: Full support ✅
- **Samsung Internet**: Full support ✅

## Development Notes

### Service Worker Updates
When you modify the service worker code:
1. The browser will detect changes on next page load
2. Users will get a notification to update
3. They must close all tabs and reopen to activate the new service worker

### Testing Service Worker Locally
```bash
# Build the app
npm run build

# Serve the build folder
npx serve -s build

# Open http://localhost:3000 (or the port shown)
# Service workers only work on localhost or HTTPS
```

### Debugging
1. Open DevTools > Application > Service Workers
2. Check "Update on reload" during development
3. Use "Unregister" to force a clean service worker install
4. Check IndexedDB > recipebook-settings > settings > appSettings

## Future Improvements

Possible enhancements:
- Add support for multiple icon sizes in settings
- Allow separate icons for different platforms (iOS vs Android)
- Provide icon preview with masks applied
- Add icon generator tool for creating proper PWA icons
- Implement icon validation (check safe zone content)
