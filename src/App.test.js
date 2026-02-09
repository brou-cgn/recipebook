import React from 'react';
import { render, screen } from '@testing-library/react';
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
