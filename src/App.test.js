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
  const recipesHeading = screen.getByText(/My Recipes/i);
  expect(recipesHeading).toBeInTheDocument();
});

test('renders Add Recipe button', () => {
  render(<App />);
  const addButton = screen.getByRole('button', { name: /Add Recipe/i });
  expect(addButton).toBeInTheDocument();
});

test('recipe form includes new metadata fields', () => {
  render(<App />);
  const addButton = screen.getByRole('button', { name: /Add Recipe/i });
  fireEvent.click(addButton);
  
  // Check for new fields
  expect(screen.getByLabelText(/Servings/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Cooking Time/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Cuisine Type/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Meal Category/i)).toBeInTheDocument();
  expect(screen.getByText(/Difficulty Level/i)).toBeInTheDocument();
});

test('recipe form has default values for new fields', () => {
  render(<App />);
  const addButton = screen.getByRole('button', { name: /Add Recipe/i });
  fireEvent.click(addButton);
  
  // Check default values
  expect(screen.getByLabelText(/Servings/i)).toHaveValue(4);
  expect(screen.getByLabelText(/Cooking Time/i)).toHaveValue(30);
  
  // Check that difficulty level 3 is selected by default
  const difficultyRadios = screen.getAllByRole('radio');
  const selectedRadio = difficultyRadios.find(radio => radio.checked);
  expect(selectedRadio).toHaveAttribute('value', '3');
});
