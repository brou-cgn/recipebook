/**
 * Recipe Firestore Utilities
 * Handles recipe data storage and real-time sync with Firestore
 */

import { db } from '../firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { removeUndefinedFields } from './firestoreUtils';
import { deleteRecipeImage } from './storageUtils';

/**
 * Set up real-time listener for recipes
 * Filters private (draft) recipes to only show to admins and recipe authors
 * @param {string} userId - Current user ID (to filter private recipes)
 * @param {boolean} isAdmin - Whether current user is an admin
 * @param {Function} callback - Callback function that receives recipes array
 * @returns {Function} Unsubscribe function
 */
export const subscribeToRecipes = (userId, isAdmin, callback) => {
  const recipesRef = collection(db, 'recipes');
  
  return onSnapshot(recipesRef, (snapshot) => {
    const recipes = [];
    snapshot.forEach((doc) => {
      const recipe = {
        id: doc.id,
        ...doc.data()
      };
      
      // Include recipe if it's public OR if it's private and (user is admin OR recipe author)
      if (!recipe.isPrivate || isAdmin || recipe.authorId === userId) {
        recipes.push(recipe);
      }
    });
    callback(recipes);
  }, (error) => {
    console.error('Error subscribing to recipes:', error);
    callback([]);
  });
};

/**
 * Get all recipes (one-time fetch)
 * Filters private (draft) recipes to only show to admins and recipe authors
 * @param {string} userId - Current user ID (to filter private recipes)
 * @param {boolean} isAdmin - Whether current user is an admin
 * @returns {Promise<Array>} Promise resolving to array of recipes
 */
export const getRecipes = async (userId, isAdmin) => {
  try {
    const recipesRef = collection(db, 'recipes');
    const snapshot = await getDocs(recipesRef);
    const recipes = [];
    snapshot.forEach((doc) => {
      const recipe = {
        id: doc.id,
        ...doc.data()
      };
      
      // Include recipe if it's public OR if it's private and (user is admin OR recipe author)
      if (!recipe.isPrivate || isAdmin || recipe.authorId === userId) {
        recipes.push(recipe);
      }
    });
    return recipes;
  } catch (error) {
    console.error('Error getting recipes:', error);
    return [];
  }
};

/**
 * Add a new recipe to Firestore
 * @param {Object} recipe - Recipe object
 * @param {string} authorId - ID of the user creating the recipe
 * @returns {Promise<Object>} Promise resolving to the created recipe with ID
 */
export const addRecipe = async (recipe, authorId) => {
  try {
    const recipeData = {
      ...recipe,
      authorId,
      createdAt: recipe.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    // Remove undefined fields before sending to Firestore
    const cleanedData = removeUndefinedFields(recipeData);
    
    const docRef = await addDoc(collection(db, 'recipes'), cleanedData);
    
    return {
      id: docRef.id,
      ...cleanedData
    };
  } catch (error) {
    console.error('Error adding recipe:', error);
    throw error;
  }
};

/**
 * Update an existing recipe in Firestore
 * @param {string} recipeId - ID of the recipe to update
 * @param {Object} updates - Object containing fields to update
 * @returns {Promise<void>}
 */
export const updateRecipe = async (recipeId, updates) => {
  try {
    const recipeRef = doc(db, 'recipes', recipeId);
    const updateData = {
      ...updates,
      updatedAt: serverTimestamp()
    };
    
    // Remove undefined fields before sending to Firestore
    const cleanedData = removeUndefinedFields(updateData);
    
    await updateDoc(recipeRef, cleanedData);
  } catch (error) {
    console.error('Error updating recipe:', error);
    throw error;
  }
};

/**
 * Delete a recipe from Firestore
 * @param {string} recipeId - ID of the recipe to delete
 * @returns {Promise<void>}
 */
export const deleteRecipe = async (recipeId) => {
  try {
    // First, get the recipe to check if it has an image
    const recipeRef = doc(db, 'recipes', recipeId);
    const recipeSnap = await getDoc(recipeRef);
    
    if (recipeSnap.exists()) {
      const recipeData = recipeSnap.data();
      
      // Delete the image from Storage if it exists
      if (recipeData.image) {
        await deleteRecipeImage(recipeData.image);
      }
    }
    
    // Delete the recipe document
    await deleteDoc(recipeRef);
  } catch (error) {
    console.error('Error deleting recipe:', error);
    throw error;
  }
};

/**
 * Seed sample recipes if none exist
 * Uses a flag in Firestore settings to ensure seeding only happens once
 * @param {string} authorId - ID of the user to set as author
 * @returns {Promise<void>}
 */
export const seedSampleRecipes = async (authorId) => {
  try {
    // Check if seeding has already been done
    const { doc: firestoreDoc, getDoc, setDoc } = await import('firebase/firestore');
    const { db } = await import('../firebase');
    
    const settingsRef = firestoreDoc(db, 'settings', 'app');
    const settingsSnap = await getDoc(settingsRef);
    
    // If settings exist and recipesSeeded flag is true, skip seeding
    if (settingsSnap.exists() && settingsSnap.data().recipesSeeded) {
      return;
    }
    
    // Double-check recipes collection is empty
    // Use admin access (true) to check all recipes, including private ones
    const recipes = await getRecipes(null, true);
    if (recipes.length > 0) {
      // Recipes exist, set the flag and return
      if (settingsSnap.exists()) {
        await import('firebase/firestore').then(({ updateDoc }) =>
          updateDoc(settingsRef, { recipesSeeded: true })
        );
      } else {
        await setDoc(settingsRef, { recipesSeeded: true });
      }
      return;
    }
    
    // Seed sample recipes
    const sampleRecipes = getSampleRecipes();
    
    for (const recipe of sampleRecipes) {
      await addRecipe(recipe, authorId);
    }
    
    // Set the seeded flag
    if (settingsSnap.exists()) {
      await import('firebase/firestore').then(({ updateDoc }) =>
        updateDoc(settingsRef, { recipesSeeded: true })
      );
    } else {
      await setDoc(settingsRef, { recipesSeeded: true });
    }
  } catch (error) {
    console.error('Error seeding sample recipes:', error);
  }
};

/**
 * Get sample recipes data
 * @returns {Array} Array of sample recipe objects
 */
function getSampleRecipes() {
  return [
    {
      title: 'Spaghetti Carbonara',
      image: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?w=400',
      portionen: 4,
      kulinarik: 'Italian',
      schwierigkeit: 3,
      kochdauer: 30,
      speisekategorie: 'Main Course',
      ingredients: [
        '400g Spaghetti',
        '200g Pancetta or Guanciale',
        '4 egg yolks',
        '100g Pecorino Romano cheese',
        'Black pepper',
        'Salt'
      ],
      steps: [
        'Cook spaghetti in salted boiling water according to package instructions.',
        'While pasta cooks, cut pancetta into small pieces and fry until crispy.',
        'In a bowl, mix egg yolks with grated Pecorino Romano and black pepper.',
        'Drain pasta, reserving 1 cup of pasta water.',
        'Add hot pasta to pancetta pan, remove from heat.',
        'Quickly mix in egg mixture, adding pasta water to create a creamy sauce.',
        'Serve immediately with extra cheese and black pepper.'
      ]
    },
    {
      title: 'Classic Margherita Pizza',
      image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400',
      portionen: 2,
      kulinarik: 'Italian',
      schwierigkeit: 2,
      kochdauer: 25,
      speisekategorie: 'Main Course',
      ingredients: [
        '500g Pizza dough',
        '200g San Marzano tomatoes',
        '200g Fresh mozzarella',
        'Fresh basil leaves',
        '2 tbsp Olive oil',
        'Salt',
        'Oregano'
      ],
      steps: [
        'Preheat oven to 250°C (480°F).',
        'Roll out pizza dough to desired thickness.',
        'Crush tomatoes and spread evenly on dough, leaving a border.',
        'Season with salt and oregano.',
        'Tear mozzarella and distribute over the pizza.',
        'Drizzle with olive oil.',
        'Bake for 10-12 minutes until crust is golden.',
        'Top with fresh basil leaves before serving.'
      ]
    },
    {
      title: 'Chocolate Chip Cookies',
      image: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=400',
      portionen: 24,
      kulinarik: 'American',
      schwierigkeit: 1,
      kochdauer: 40,
      speisekategorie: 'Dessert',
      ingredients: [
        '200g Butter, softened',
        '150g Brown sugar',
        '100g White sugar',
        '2 Eggs',
        '2 tsp Vanilla extract',
        '300g All-purpose flour',
        '1 tsp Baking soda',
        '1/2 tsp Salt',
        '300g Chocolate chips'
      ],
      steps: [
        'Preheat oven to 180°C (350°F).',
        'Cream together butter and both sugars until fluffy.',
        'Beat in eggs and vanilla extract.',
        'In separate bowl, mix flour, baking soda, and salt.',
        'Gradually blend dry ingredients into wet mixture.',
        'Fold in chocolate chips.',
        'Drop spoonfuls of dough onto baking sheets.',
        'Bake for 10-12 minutes until edges are golden.',
        'Cool on baking sheet for 5 minutes before transferring.'
      ]
    }
  ];
}
