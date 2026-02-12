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

test('renders DishBook header', () => {
  setupLoggedInUser();
  render(<App />);
  const headerElement = screen.getByText(/DishBook/i);
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
