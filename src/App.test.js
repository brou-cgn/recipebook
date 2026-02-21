import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

// Mock user setup for tests
const setupLoggedInUser = () => {
  const mockUser = {
    id: 'test-user-id',
    vorname: 'Test',
    nachname: 'User',
    email: 'test@example.com',
    isAdmin: true,
    role: 'admin',
    requiresPasswordChange: false
  };
  localStorage.setItem('currentUser', JSON.stringify(mockUser));
};

// Clear user after each test
afterEach(() => {
  localStorage.clear();
});

test('renders brouBook header', () => {
  setupLoggedInUser();
  render(<App />);
  const headerElement = screen.getByText(/brouBook/i);
  expect(headerElement).toBeInTheDocument();
});

test('renders "Rezepte" heading with no filters', () => {
  setupLoggedInUser();
  render(<App />);
  const recipesHeading = screen.getByRole('heading', { name: /^Rezepte$/, level: 2 });
  expect(recipesHeading).toBeInTheDocument();
});

test('renders Add Recipe button', () => {
  setupLoggedInUser();
  render(<App />);
  const addButton = screen.getByRole('button', { name: /Rezept hinzufügen/i });
  expect(addButton).toBeInTheDocument();
});

test('recipe form includes new metadata fields', () => {
  setupLoggedInUser();
  render(<App />);
  const addButton = screen.getByRole('button', { name: /Rezept hinzufügen/i });
  fireEvent.click(addButton);
  
  // Check for new fields
  expect(screen.getByLabelText(/Portionen/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Kochzeit/i)).toBeInTheDocument();
  expect(screen.getByText(/Kulinarik.*Mehrfachauswahl/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Speisekategorie/i)).toBeInTheDocument();
  expect(screen.getByText(/Schwierigkeitsgrad/i)).toBeInTheDocument();
});

test('recipe form has default values for new fields', () => {
  setupLoggedInUser();
  render(<App />);
  const addButton = screen.getByRole('button', { name: /Rezept hinzufügen/i });
  fireEvent.click(addButton);
  
  // Check default values
  expect(screen.getByLabelText(/Portionen/i)).toHaveValue(4);
  expect(screen.getByLabelText(/Kochzeit/i)).toHaveValue(30);
  
  // Check that difficulty level 3 is selected by default
  const filledStars = document.querySelectorAll('.difficulty-slider .star.filled');
  expect(filledStars).toHaveLength(3);
});

test('category filter is displayed in header', () => {
  setupLoggedInUser();
  render(<App />);
  const categoryFilter = screen.getByRole('combobox', { name: /Nach Kategorie filtern/i });
  expect(categoryFilter).toBeInTheDocument();
  expect(categoryFilter).toHaveValue('');
});

test('favorites filter button is displayed in header', () => {
  setupLoggedInUser();
  render(<App />);
  const favoritesButton = screen.getByRole('button', { name: /Favoriten/i });
  expect(favoritesButton).toBeInTheDocument();
});

test('category filter shows only recipes of selected category', () => {
  setupLoggedInUser();
  render(<App />);
  
  // Initially should show all 3 sample recipes
  expect(screen.getByText('Spaghetti Carbonara')).toBeInTheDocument();
  expect(screen.getByText('Classic Margherita Pizza')).toBeInTheDocument();
  expect(screen.getByText('Chocolate Chip Cookies')).toBeInTheDocument();
  
  // Filter by Dessert
  const categoryFilter = screen.getByRole('combobox', { name: /Nach Kategorie filtern/i });
  fireEvent.change(categoryFilter, { target: { value: 'Dessert' } });
  
  // Should only show Dessert recipes
  expect(screen.queryByText('Spaghetti Carbonara')).not.toBeInTheDocument();
  expect(screen.queryByText('Classic Margherita Pizza')).not.toBeInTheDocument();
  expect(screen.getByText('Chocolate Chip Cookies')).toBeInTheDocument();
});

test('heading changes to category name when category filter is selected', () => {
  setupLoggedInUser();
  render(<App />);
  
  // Initially should show "Rezepte" as heading (not button text)
  const initialHeading = screen.getByRole('heading', { name: /^Rezepte$/, level: 2 });
  expect(initialHeading).toBeInTheDocument();
  
  // Change category filter
  const categoryFilter = screen.getByRole('combobox', { name: /Nach Kategorie filtern/i });
  fireEvent.change(categoryFilter, { target: { value: 'Dessert' } });
  
  // Heading should now show "Dessert"
  const newHeading = screen.getByRole('heading', { name: /^Dessert$/, level: 2 });
  expect(newHeading).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /^Rezepte$/, level: 2 })).not.toBeInTheDocument();
});

test('heading shows "Meine Rezepte" when favorites filter is active with no category', () => {
  setupLoggedInUser();
  render(<App />);
  
  // Click favorites filter
  const favoritesButton = screen.getByRole('button', { name: /Favoriten/i });
  fireEvent.click(favoritesButton);
  
  // Heading should show "Meine Rezepte"
  expect(screen.getByText('Meine Rezepte')).toBeInTheDocument();
});

test('heading shows "Meine" + category when both filters are active', () => {
  setupLoggedInUser();
  render(<App />);
  
  // Select category
  const categoryFilter = screen.getByRole('combobox', { name: /Nach Kategorie filtern/i });
  fireEvent.change(categoryFilter, { target: { value: 'Main Course' } });
  
  // Click favorites filter
  const favoritesButton = screen.getByRole('button', { name: /Favoriten/i });
  fireEvent.click(favoritesButton);
  
  // Heading should show "Meine Main Course"
  expect(screen.getByText('Meine Main Course')).toBeInTheDocument();
});

describe('Multi-category filtering', () => {
  test('recipe with multiple categories appears when filtering by any of its categories', () => {
    setupLoggedInUser();
    
    // Add custom categories to match our test recipes
    const customLists = {
      cuisineTypes: ['Italian', 'German'],
      mealCategories: ['Hauptspeisen', 'Pizzen', 'Dessert'],
      units: ['g', 'kg', 'ml', 'l'],
      portionUnits: [{ id: 'portion', singular: 'Portion', plural: 'Portionen' }]
    };
    localStorage.setItem('customLists', JSON.stringify(customLists));
    
    // Create recipes with multiple categories
    const multiCategoryRecipes = [
      {
        id: '1',
        title: 'Pizza Margherita',
        ingredients: ['Teig', 'Tomaten', 'Mozzarella'],
        steps: ['Teig ausrollen', 'Belegen', 'Backen'],
        speisekategorie: ['Hauptspeisen', 'Pizzen'],
        authorId: 'test-user-id'
      },
      {
        id: '2',
        title: 'Pasta Carbonara',
        ingredients: ['Pasta', 'Eier', 'Speck'],
        steps: ['Pasta kochen', 'Sauce machen'],
        speisekategorie: ['Hauptspeisen'],
        authorId: 'test-user-id'
      },
      {
        id: '3',
        title: 'Tiramisu',
        ingredients: ['Mascarpone', 'Kaffee'],
        steps: ['Schichten'],
        speisekategorie: ['Dessert'],
        authorId: 'test-user-id'
      }
    ];
    
    localStorage.setItem('recipes', JSON.stringify(multiCategoryRecipes));
    
    render(<App />);
    
    // Initially all recipes should be visible
    expect(screen.getByText('Pizza Margherita')).toBeInTheDocument();
    expect(screen.getByText('Pasta Carbonara')).toBeInTheDocument();
    expect(screen.getByText('Tiramisu')).toBeInTheDocument();
    
    // Filter by "Hauptspeisen" - should show both Pizza and Pasta
    const categoryFilter = screen.getByRole('combobox', { name: /Nach Kategorie filtern/i });
    fireEvent.change(categoryFilter, { target: { value: 'Hauptspeisen' } });
    
    expect(screen.getByText('Pizza Margherita')).toBeInTheDocument();
    expect(screen.getByText('Pasta Carbonara')).toBeInTheDocument();
    expect(screen.queryByText('Tiramisu')).not.toBeInTheDocument();
    
    // Filter by "Pizzen" - should show only Pizza
    fireEvent.change(categoryFilter, { target: { value: 'Pizzen' } });
    
    expect(screen.getByText('Pizza Margherita')).toBeInTheDocument();
    expect(screen.queryByText('Pasta Carbonara')).not.toBeInTheDocument();
    expect(screen.queryByText('Tiramisu')).not.toBeInTheDocument();
    
    // Filter by "Dessert" - should show only Tiramisu
    fireEvent.change(categoryFilter, { target: { value: 'Dessert' } });
    
    expect(screen.queryByText('Pizza Margherita')).not.toBeInTheDocument();
    expect(screen.queryByText('Pasta Carbonara')).not.toBeInTheDocument();
    expect(screen.getByText('Tiramisu')).toBeInTheDocument();
  });
  
  test('recipe with old string format category still works with filter', () => {
    setupLoggedInUser();
    
    // Create recipes with old string format
    const oldFormatRecipes = [
      {
        id: '1',
        title: 'Old Format Recipe',
        ingredients: ['Ingredient 1'],
        steps: ['Step 1'],
        speisekategorie: 'Main Course',
        authorId: 'test-user-id'
      }
    ];
    
    localStorage.setItem('recipes', JSON.stringify(oldFormatRecipes));
    
    render(<App />);
    
    expect(screen.getByText('Old Format Recipe')).toBeInTheDocument();
    
    // Filter by the category
    const categoryFilter = screen.getByRole('combobox', { name: /Nach Kategorie filtern/i });
    fireEvent.change(categoryFilter, { target: { value: 'Main Course' } });
    
    // Recipe should still be visible
    expect(screen.getByText('Old Format Recipe')).toBeInTheDocument();
    
    // Filter by different category
    fireEvent.change(categoryFilter, { target: { value: 'Dessert' } });
    
    // Recipe should not be visible
    expect(screen.queryByText('Old Format Recipe')).not.toBeInTheDocument();
  });
});
