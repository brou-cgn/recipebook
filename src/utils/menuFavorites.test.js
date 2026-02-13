import {
  getAllMenuFavorites,
  saveAllMenuFavorites,
  getUserMenuFavorites,
  isMenuFavorite,
  addMenuFavorite,
  removeMenuFavorite,
  toggleMenuFavorite,
  getFavoriteMenus
} from './menuFavorites';

// Clear localStorage before each test
beforeEach(() => {
  localStorage.clear();
});

describe('menuFavorites utility functions', () => {
  describe('getAllMenuFavorites and saveAllMenuFavorites', () => {
    test('returns empty object when no favorites exist', () => {
      expect(getAllMenuFavorites()).toEqual({});
    });

    test('saves and retrieves favorites correctly', () => {
      const favorites = {
        'user1': ['menu1', 'menu2'],
        'user2': ['menu3']
      };
      saveAllMenuFavorites(favorites);
      expect(getAllMenuFavorites()).toEqual(favorites);
    });
  });

  describe('getUserMenuFavorites', () => {
    test('returns empty array for user with no favorites', () => {
      expect(getUserMenuFavorites('user1')).toEqual([]);
    });

    test('returns empty array when userId is null or undefined', () => {
      expect(getUserMenuFavorites(null)).toEqual([]);
      expect(getUserMenuFavorites(undefined)).toEqual([]);
    });

    test('returns user-specific favorites', () => {
      const favorites = {
        'user1': ['menu1', 'menu2'],
        'user2': ['menu3']
      };
      saveAllMenuFavorites(favorites);
      expect(getUserMenuFavorites('user1')).toEqual(['menu1', 'menu2']);
      expect(getUserMenuFavorites('user2')).toEqual(['menu3']);
    });
  });

  describe('isMenuFavorite', () => {
    test('returns false when menu is not a favorite', () => {
      expect(isMenuFavorite('user1', 'menu1')).toBe(false);
    });

    test('returns false when userId or menuId is null', () => {
      expect(isMenuFavorite(null, 'menu1')).toBe(false);
      expect(isMenuFavorite('user1', null)).toBe(false);
    });

    test('returns true when menu is a favorite', () => {
      addMenuFavorite('user1', 'menu1');
      expect(isMenuFavorite('user1', 'menu1')).toBe(true);
    });
  });

  describe('addMenuFavorite', () => {
    test('adds menu to user favorites', () => {
      const result = addMenuFavorite('user1', 'menu1');
      expect(result).toBe(true);
      expect(getUserMenuFavorites('user1')).toEqual(['menu1']);
    });

    test('does not add duplicate favorites', () => {
      addMenuFavorite('user1', 'menu1');
      addMenuFavorite('user1', 'menu1');
      expect(getUserMenuFavorites('user1')).toEqual(['menu1']);
    });

    test('returns false when userId or menuId is invalid', () => {
      expect(addMenuFavorite(null, 'menu1')).toBe(false);
      expect(addMenuFavorite('user1', null)).toBe(false);
    });
  });

  describe('removeMenuFavorite', () => {
    test('removes menu from user favorites', () => {
      addMenuFavorite('user1', 'menu1');
      addMenuFavorite('user1', 'menu2');
      
      const result = removeMenuFavorite('user1', 'menu1');
      expect(result).toBe(true);
      expect(getUserMenuFavorites('user1')).toEqual(['menu2']);
    });

    test('returns false when userId or menuId is invalid', () => {
      expect(removeMenuFavorite(null, 'menu1')).toBe(false);
      expect(removeMenuFavorite('user1', null)).toBe(false);
    });
  });

  describe('toggleMenuFavorite', () => {
    test('adds menu when not already a favorite', () => {
      const result = toggleMenuFavorite('user1', 'menu1');
      expect(result).toBe(true);
      expect(isMenuFavorite('user1', 'menu1')).toBe(true);
    });

    test('removes menu when already a favorite', () => {
      addMenuFavorite('user1', 'menu1');
      const result = toggleMenuFavorite('user1', 'menu1');
      expect(result).toBe(false);
      expect(isMenuFavorite('user1', 'menu1')).toBe(false);
    });

    test('returns false when userId or menuId is invalid', () => {
      expect(toggleMenuFavorite(null, 'menu1')).toBe(false);
      expect(toggleMenuFavorite('user1', null)).toBe(false);
    });
  });

  describe('getFavoriteMenus', () => {
    test('returns empty array when no menus are provided', () => {
      expect(getFavoriteMenus('user1', [])).toEqual([]);
    });

    test('returns only favorite menus', () => {
      const menus = [
        { id: 'menu1', name: 'Menu 1' },
        { id: 'menu2', name: 'Menu 2' },
        { id: 'menu3', name: 'Menu 3' }
      ];
      
      addMenuFavorite('user1', 'menu1');
      addMenuFavorite('user1', 'menu3');
      
      const favoriteMenus = getFavoriteMenus('user1', menus);
      expect(favoriteMenus).toHaveLength(2);
      expect(favoriteMenus[0].id).toBe('menu1');
      expect(favoriteMenus[1].id).toBe('menu3');
    });

    test('returns empty array when userId is invalid', () => {
      const menus = [{ id: 'menu1', name: 'Menu 1' }];
      expect(getFavoriteMenus(null, menus)).toEqual([]);
    });
  });
});
