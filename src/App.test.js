import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

test('renders RecipeBook header', () => {
  render(<App />);
  const headerElement = screen.getByText(/RecipeBook/i);
  expect(headerElement).toBeInTheDocument();
});

test('renders My Recipes section', () => {
  render(<App />);
  const recipesHeading = screen.getByText(/Meine Rezepte/i);
  expect(recipesHeading).toBeInTheDocument();
});

test('renders Add Recipe button', () => {
  render(<App />);
  const addButton = screen.getByRole('button', { name: /Rezept hinzufügen/i });
  expect(addButton).toBeInTheDocument();
});

test('recipe form includes new metadata fields', () => {
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
  render(<App />);
  const categoryFilter = screen.getByRole('combobox', { name: /Nach Kategorie filtern/i });
  expect(categoryFilter).toBeInTheDocument();
  expect(categoryFilter).toHaveValue('');
});

test('favorites filter button is displayed in header', () => {
  render(<App />);
  const favoritesButton = screen.getByRole('button', { name: /Favoriten/i });
  expect(favoritesButton).toBeInTheDocument();
});

test('category filter shows only recipes of selected category', () => {
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
