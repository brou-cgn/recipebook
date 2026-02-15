import { updateFavicon, updatePageTitle, applyFaviconSettings } from './faviconUtils';
import { getSettings } from './customLists';

// Mock customLists module
jest.mock('./customLists', () => ({
  DEFAULT_FAVICON_TEXT: 'DishBook',
  DEFAULT_SLOGAN: 'Unsere Besten',
  getSettings: jest.fn()
}));

describe('faviconUtils', () => {
  let mockHead;
  
  beforeEach(() => {
    // Setup DOM environment
    document.head.innerHTML = '';
    
    // Create initial favicon and apple-touch-icon elements as they would be in index.html
    const faviconLink = document.createElement('link');
    faviconLink.rel = 'icon';
    faviconLink.href = '/favicon.ico';
    document.head.appendChild(faviconLink);
    
    const appleTouchIcon = document.createElement('link');
    appleTouchIcon.rel = 'apple-touch-icon';
    appleTouchIcon.href = '/logo192.png';
    document.head.appendChild(appleTouchIcon);
    
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('updateFavicon', () => {
    test('updates both icon and apple-touch-icon with custom base64 image', () => {
      const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      
      updateFavicon(testImage);
      
      const iconLink = document.querySelector("link[rel='icon']");
      const appleIconLink = document.querySelector("link[rel='apple-touch-icon']");
      
      expect(iconLink).not.toBeNull();
      expect(iconLink.href).toBe(testImage);
      
      expect(appleIconLink).not.toBeNull();
      expect(appleIconLink.href).toBe(testImage);
    });

    test('resets to default icons when imageBase64 is null', () => {
      // First set a custom image
      const testImage = 'data:image/png;base64,test';
      updateFavicon(testImage);
      
      // Then reset to defaults
      updateFavicon(null);
      
      const iconLink = document.querySelector("link[rel='icon']");
      const appleIconLink = document.querySelector("link[rel='apple-touch-icon']");
      
      expect(iconLink.href).toContain('/favicon.ico');
      expect(appleIconLink.href).toContain('/logo192.png');
    });

    test('creates icon element if it does not exist', () => {
      // Remove existing icon
      const existingIcon = document.querySelector("link[rel='icon']");
      existingIcon.remove();
      
      const testImage = 'data:image/png;base64,test';
      updateFavicon(testImage);
      
      const iconLink = document.querySelector("link[rel='icon']");
      expect(iconLink).not.toBeNull();
      expect(iconLink.href).toBe(testImage);
    });

    test('creates apple-touch-icon element if it does not exist', () => {
      // Remove existing apple-touch-icon
      const existingAppleIcon = document.querySelector("link[rel='apple-touch-icon']");
      existingAppleIcon.remove();
      
      const testImage = 'data:image/png;base64,test';
      updateFavicon(testImage);
      
      const appleIconLink = document.querySelector("link[rel='apple-touch-icon']");
      expect(appleIconLink).not.toBeNull();
      expect(appleIconLink.href).toBe(testImage);
    });

    test('uses exact selectors to avoid matching wrong elements', () => {
      // Add a link with rel containing 'icon' but not exactly matching
      const otherLink = document.createElement('link');
      otherLink.rel = 'shortcut icon';
      otherLink.href = '/other.ico';
      document.head.insertBefore(otherLink, document.head.firstChild);
      
      const testImage = 'data:image/png;base64,test';
      updateFavicon(testImage);
      
      // The shortcut icon should not be affected
      const shortcutIcon = document.querySelector("link[rel='shortcut icon']");
      expect(shortcutIcon.href).toContain('/other.ico');
      
      // But the exact icon should be updated
      const iconLink = document.querySelector("link[rel='icon']");
      expect(iconLink.href).toBe(testImage);
    });
  });

  describe('updatePageTitle', () => {
    test('updates title with text and slogan', () => {
      updatePageTitle('MyRecipes', 'Best Recipes Ever');
      expect(document.title).toBe('MyRecipes - Best Recipes Ever');
    });

    test('uses default slogan when slogan is not provided', () => {
      updatePageTitle('MyRecipes', null);
      expect(document.title).toBe('MyRecipes - Unsere Besten');
    });

    test('uses default favicon text when text is not provided', () => {
      updatePageTitle(null, 'Custom Slogan');
      expect(document.title).toBe('DishBook - Custom Slogan');
    });

    test('uses both defaults when neither text nor slogan provided', () => {
      updatePageTitle(null, null);
      expect(document.title).toBe('DishBook - Unsere Besten');
    });
  });

  describe('applyFaviconSettings', () => {
    test('applies custom favicon image and text from settings', async () => {
      const testImage = 'data:image/png;base64,test';
      getSettings.mockResolvedValue({
        faviconImage: testImage,
        faviconText: 'Custom Recipe Book',
        headerSlogan: 'Delicious Recipes'
      });

      await applyFaviconSettings();

      const iconLink = document.querySelector("link[rel='icon']");
      const appleIconLink = document.querySelector("link[rel='apple-touch-icon']");
      
      expect(iconLink.href).toBe(testImage);
      expect(appleIconLink.href).toBe(testImage);
      expect(document.title).toBe('Custom Recipe Book - Delicious Recipes');
    });

    test('applies default icons when faviconImage is not set', async () => {
      getSettings.mockResolvedValue({
        faviconText: 'Custom Recipe Book',
        headerSlogan: 'Delicious Recipes'
      });

      await applyFaviconSettings();

      const iconLink = document.querySelector("link[rel='icon']");
      const appleIconLink = document.querySelector("link[rel='apple-touch-icon']");
      
      expect(iconLink.href).toContain('/favicon.ico');
      expect(appleIconLink.href).toContain('/logo192.png');
      expect(document.title).toBe('Custom Recipe Book - Delicious Recipes');
    });

    test('applies default icons when faviconImage is null', async () => {
      getSettings.mockResolvedValue({
        faviconImage: null,
        faviconText: 'Custom Recipe Book',
        headerSlogan: 'Delicious Recipes'
      });

      await applyFaviconSettings();

      const iconLink = document.querySelector("link[rel='icon']");
      const appleIconLink = document.querySelector("link[rel='apple-touch-icon']");
      
      expect(iconLink.href).toContain('/favicon.ico');
      expect(appleIconLink.href).toContain('/logo192.png');
      expect(document.title).toBe('Custom Recipe Book - Delicious Recipes');
    });

    test('uses defaults on error', async () => {
      getSettings.mockRejectedValue(new Error('Failed to get settings'));

      await applyFaviconSettings();

      expect(document.title).toBe('DishBook - Unsere Besten');
    });
  });
});
