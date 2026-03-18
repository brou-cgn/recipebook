// Firebase module mocks
let mockFirestoreStore = {};
const resetStore = () => { mockFirestoreStore = {}; };

jest.mock("../firebase", () => ({ db: {} }));
jest.mock("firebase/firestore", () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
  updateDoc: jest.fn(),
  arrayUnion: jest.fn((...args) => args),
  arrayRemove: jest.fn((...args) => args),
}));

import {
  getUserMenuFavorites,
  isMenuFavorite,
  addMenuFavorite,
  removeMenuFavorite,
  toggleMenuFavorite,
  getFavoriteMenus
} from "./menuFavorites";

beforeEach(() => {
  resetStore();
  const { doc, getDoc, updateDoc } = require("firebase/firestore");
  doc.mockImplementation((_db, col, id) => ({ _col: col, _id: id, _key: col + "/" + id }));
  getDoc.mockImplementation(async (ref) => {
    const data = mockFirestoreStore[ref._key] || null;
    return { exists: () => !!data, data: () => data };
  });
  updateDoc.mockResolvedValue(undefined);
});

const seedUser = (userId, favoriteMenus = []) => {
  mockFirestoreStore["users/" + userId] = { favoriteMenus: [...favoriteMenus] };
};

describe("menuFavorites utility functions", () => {
  describe("getUserMenuFavorites", () => {
    test("returns empty array for user with no favorites", async () => {
      seedUser("user1", []);
      expect(await getUserMenuFavorites("user1")).toEqual([]);
    });

    test("returns empty array when userId is null or undefined", async () => {
      expect(await getUserMenuFavorites(null)).toEqual([]);
      expect(await getUserMenuFavorites(undefined)).toEqual([]);
    });

    test("returns user-specific favorites", async () => {
      seedUser("user1", ["menu1", "menu2"]);
      seedUser("user2", ["menu3"]);
      expect(await getUserMenuFavorites("user1")).toEqual(["menu1", "menu2"]);
      expect(await getUserMenuFavorites("user2")).toEqual(["menu3"]);
    });
  });

  describe("isMenuFavorite", () => {
    test("returns false when menu is not a favorite", async () => {
      seedUser("user1", []);
      expect(await isMenuFavorite("user1", "menu1")).toBe(false);
    });

    test("returns false when userId or menuId is null", async () => {
      expect(await isMenuFavorite(null, "menu1")).toBe(false);
      expect(await isMenuFavorite("user1", null)).toBe(false);
    });

    test("returns true when menu is a favorite", async () => {
      seedUser("user1", ["menu1"]);
      expect(await isMenuFavorite("user1", "menu1")).toBe(true);
    });
  });

  describe("addMenuFavorite", () => {
    test("returns true on success", async () => {
      seedUser("user1", []);
      expect(await addMenuFavorite("user1", "menu1")).toBe(true);
    });

    test("calls updateDoc with correct arguments", async () => {
      const { updateDoc, arrayUnion } = require("firebase/firestore");
      seedUser("user1", []);
      await addMenuFavorite("user1", "menu1");
      expect(updateDoc).toHaveBeenCalled();
    });

    test("returns false when userId or menuId is invalid", async () => {
      expect(await addMenuFavorite(null, "menu1")).toBe(false);
      expect(await addMenuFavorite("user1", null)).toBe(false);
    });
  });

  describe("removeMenuFavorite", () => {
    test("returns true on success", async () => {
      seedUser("user1", ["menu1", "menu2"]);
      expect(await removeMenuFavorite("user1", "menu1")).toBe(true);
    });

    test("calls updateDoc with correct arguments", async () => {
      const { updateDoc } = require("firebase/firestore");
      seedUser("user1", ["menu1"]);
      await removeMenuFavorite("user1", "menu1");
      expect(updateDoc).toHaveBeenCalled();
    });

    test("returns false when userId or menuId is invalid", async () => {
      expect(await removeMenuFavorite(null, "menu1")).toBe(false);
      expect(await removeMenuFavorite("user1", null)).toBe(false);
    });
  });

  describe("toggleMenuFavorite", () => {
    test("adds menu when not already a favorite (returns true)", async () => {
      seedUser("user1", []);
      const result = await toggleMenuFavorite("user1", "menu1");
      expect(result).toBe(true);
    });

    test("removes menu when already a favorite (returns false)", async () => {
      seedUser("user1", ["menu1"]);
      const result = await toggleMenuFavorite("user1", "menu1");
      expect(result).toBe(false);
    });

    test("returns false when userId or menuId is invalid", async () => {
      expect(await toggleMenuFavorite(null, "menu1")).toBe(false);
      expect(await toggleMenuFavorite("user1", null)).toBe(false);
    });
  });

  describe("getFavoriteMenus", () => {
    test("returns empty array when no menus are provided", async () => {
      seedUser("user1", []);
      expect(await getFavoriteMenus("user1", [])).toEqual([]);
    });

    test("returns only favorite menus", async () => {
      seedUser("user1", ["menu1", "menu3"]);
      const menus = [
        { id: "menu1", name: "Menu 1" },
        { id: "menu2", name: "Menu 2" },
        { id: "menu3", name: "Menu 3" }
      ];
      const result = await getFavoriteMenus("user1", menus);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("menu1");
      expect(result[1].id).toBe("menu3");
    });

    test("returns empty array when userId is invalid", async () => {
      const menus = [{ id: "menu1", name: "Menu 1" }];
      expect(await getFavoriteMenus(null, menus)).toEqual([]);
    });
  });
});
