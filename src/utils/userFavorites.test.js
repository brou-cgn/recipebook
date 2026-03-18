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
  getUserFavorites,
  isRecipeFavorite,
  addFavorite,
  removeFavorite,
  toggleFavorite,
  getFavoriteRecipes,
  migrateGlobalFavorites,
  hasAnyFavoriteInGroup
} from "./userFavorites";

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

const seedUser = (userId, favoriteRecipes = []) => {
  mockFirestoreStore["users/" + userId] = { favoriteRecipes: [...favoriteRecipes] };
};

describe("userFavorites utility functions", () => {
  describe("getUserFavorites", () => {
    test("returns empty array for user with no favorites", async () => {
      seedUser("user1", []);
      expect(await getUserFavorites("user1")).toEqual([]);
    });

    test("returns empty array when userId is null or undefined", async () => {
      expect(await getUserFavorites(null)).toEqual([]);
      expect(await getUserFavorites(undefined)).toEqual([]);
    });

    test("returns user-specific favorites", async () => {
      seedUser("user1", ["recipe1", "recipe2"]);
      seedUser("user2", ["recipe3"]);
      expect(await getUserFavorites("user1")).toEqual(["recipe1", "recipe2"]);
      expect(await getUserFavorites("user2")).toEqual(["recipe3"]);
    });
  });

  describe("isRecipeFavorite", () => {
    beforeEach(() => {
      seedUser("user1", ["recipe1", "recipe2"]);
      seedUser("user2", ["recipe3"]);
    });

    test("returns true when recipe is a favorite", async () => {
      expect(await isRecipeFavorite("user1", "recipe1")).toBe(true);
      expect(await isRecipeFavorite("user1", "recipe2")).toBe(true);
    });

    test("returns false when recipe is not a favorite", async () => {
      expect(await isRecipeFavorite("user1", "recipe3")).toBe(false);
      expect(await isRecipeFavorite("user2", "recipe1")).toBe(false);
    });

    test("returns false when userId or recipeId is null/undefined", async () => {
      expect(await isRecipeFavorite(null, "recipe1")).toBe(false);
      expect(await isRecipeFavorite("user1", null)).toBe(false);
      expect(await isRecipeFavorite(undefined, undefined)).toBe(false);
    });
  });

  describe("addFavorite", () => {
    test("returns true on success", async () => {
      seedUser("user1", []);
      expect(await addFavorite("user1", "recipe1")).toBe(true);
    });

    test("calls updateDoc when adding a favorite", async () => {
      const { updateDoc } = require("firebase/firestore");
      seedUser("user1", []);
      await addFavorite("user1", "recipe1");
      expect(updateDoc).toHaveBeenCalled();
    });

    test("returns false when userId or recipeId is null/undefined", async () => {
      expect(await addFavorite(null, "recipe1")).toBe(false);
      expect(await addFavorite("user1", null)).toBe(false);
    });
  });

  describe("removeFavorite", () => {
    test("returns true on success", async () => {
      seedUser("user1", ["recipe1", "recipe2", "recipe3"]);
      expect(await removeFavorite("user1", "recipe2")).toBe(true);
    });

    test("calls updateDoc when removing a favorite", async () => {
      const { updateDoc } = require("firebase/firestore");
      seedUser("user1", ["recipe1"]);
      await removeFavorite("user1", "recipe1");
      expect(updateDoc).toHaveBeenCalled();
    });

    test("returns false when userId or recipeId is null/undefined", async () => {
      expect(await removeFavorite(null, "recipe1")).toBe(false);
      expect(await removeFavorite("user1", null)).toBe(false);
    });
  });

  describe("toggleFavorite", () => {
    test("returns true when adding (not already a favorite)", async () => {
      seedUser("user1", []);
      expect(await toggleFavorite("user1", "recipe1")).toBe(true);
    });

    test("returns false when removing (already a favorite)", async () => {
      seedUser("user1", ["recipe1"]);
      expect(await toggleFavorite("user1", "recipe1")).toBe(false);
    });

    test("returns false when userId or recipeId is null/undefined", async () => {
      expect(await toggleFavorite(null, "recipe1")).toBe(false);
      expect(await toggleFavorite("user1", null)).toBe(false);
    });
  });

  describe("getFavoriteRecipes", () => {
    const recipes = [
      { id: "recipe1", title: "Recipe 1" },
      { id: "recipe2", title: "Recipe 2" },
      { id: "recipe3", title: "Recipe 3" },
      { id: "recipe4", title: "Recipe 4" }
    ];

    beforeEach(() => {
      seedUser("user1", ["recipe1", "recipe3"]);
      seedUser("user2", ["recipe2", "recipe4"]);
    });

    test("returns only favorite recipes for user", async () => {
      const result = await getFavoriteRecipes("user1", recipes);
      expect(result).toHaveLength(2);
      expect(result.map(r => r.id)).toEqual(["recipe1", "recipe3"]);
    });

    test("returns different favorites for different users", async () => {
      expect((await getFavoriteRecipes("user1", recipes)).map(r => r.id)).toEqual(["recipe1", "recipe3"]);
      expect((await getFavoriteRecipes("user2", recipes)).map(r => r.id)).toEqual(["recipe2", "recipe4"]);
    });

    test("returns empty array when user has no favorites", async () => {
      seedUser("user3", []);
      expect(await getFavoriteRecipes("user3", recipes)).toEqual([]);
    });

    test("returns empty array when userId is null/undefined", async () => {
      expect(await getFavoriteRecipes(null, recipes)).toEqual([]);
      expect(await getFavoriteRecipes(undefined, recipes)).toEqual([]);
    });

    test("returns empty array when recipes is null/undefined or not an array", async () => {
      expect(await getFavoriteRecipes("user1", null)).toEqual([]);
      expect(await getFavoriteRecipes("user1", undefined)).toEqual([]);
      expect(await getFavoriteRecipes("user1", "not an array")).toEqual([]);
    });
  });

  describe("migrateGlobalFavorites", () => {
    const recipes = [
      { id: "recipe1", title: "Recipe 1" },
      { id: "recipe2", title: "Recipe 2" },
    ];

    test("migrates global favorites from localStorage when user has no Firestore favorites", async () => {
      seedUser("user1", []);
      const oldFavorites = { user1: ["recipe1"] };
      localStorage.setItem("userFavorites", JSON.stringify(oldFavorites));
      await migrateGlobalFavorites("user1", recipes);
      const { updateDoc } = require("firebase/firestore");
      expect(updateDoc).toHaveBeenCalled();
      localStorage.clear();
    });

    test("does not migrate if user already has favorites in Firestore", async () => {
      seedUser("user1", ["recipe2"]);
      const { updateDoc } = require("firebase/firestore");
      updateDoc.mockClear();
      await migrateGlobalFavorites("user1", recipes);
      expect(updateDoc).not.toHaveBeenCalled();
    });

    test("handles null/undefined parameters gracefully", async () => {
      await expect(migrateGlobalFavorites(null, recipes)).resolves.not.toThrow();
      await expect(migrateGlobalFavorites("user1", null)).resolves.not.toThrow();
    });
  });

  describe("hasAnyFavoriteInGroup", () => {
    beforeEach(() => {
      seedUser("user1", ["recipe2", "recipe5"]);
    });

    test("returns true when one recipe in group is a favorite", async () => {
      const recipeGroup = [
        { id: "recipe1" }, { id: "recipe2" }, { id: "recipe3" }
      ];
      expect(await hasAnyFavoriteInGroup("user1", recipeGroup)).toBe(true);
    });

    test("returns false when no recipes in group are favorites", async () => {
      const recipeGroup = [{ id: "recipe1" }, { id: "recipe3" }, { id: "recipe4" }];
      expect(await hasAnyFavoriteInGroup("user1", recipeGroup)).toBe(false);
    });

    test("returns false when recipe group is empty", async () => {
      expect(await hasAnyFavoriteInGroup("user1", [])).toBe(false);
    });

    test("returns false when userId is null/undefined", async () => {
      expect(await hasAnyFavoriteInGroup(null, [{ id: "recipe2" }])).toBe(false);
      expect(await hasAnyFavoriteInGroup(undefined, [{ id: "recipe2" }])).toBe(false);
    });

    test("returns false when recipeGroup is null/undefined or not an array", async () => {
      expect(await hasAnyFavoriteInGroup("user1", null)).toBe(false);
      expect(await hasAnyFavoriteInGroup("user1", undefined)).toBe(false);
      expect(await hasAnyFavoriteInGroup("user1", "not an array")).toBe(false);
    });
  });
});
