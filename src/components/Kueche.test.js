import React from 'react';
import { render, screen } from '@testing-library/react';
import Kueche from './Kueche';

jest.mock('../utils/customLists', () => ({
  getTimelineBubbleIcon: () => Promise.resolve(null),
}));

describe('Kueche', () => {
  const mockRecipes = [
    {
      id: '1',
      title: 'My Recipe',
      createdAt: { toDate: () => new Date('2024-01-15') },
      ingredients: ['a'],
      steps: ['b'],
      authorId: 'user-1',
    },
    {
      id: '2',
      title: 'Other Recipe',
      createdAt: { toDate: () => new Date('2024-01-20') },
      ingredients: ['c'],
      steps: ['d'],
      authorId: 'user-2',
    },
  ];

  const mockUsers = [
    { id: 'user-1', vorname: 'John', nachname: 'Doe' },
    { id: 'user-2', vorname: 'Jane', nachname: 'Smith' },
  ];

  test('shows only recipes authored by the current user', () => {
    render(
      <Kueche
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
        currentUser={{ id: 'user-1' }}
      />
    );

    expect(screen.getByText('My Recipe')).toBeInTheDocument();
    expect(screen.queryByText('Other Recipe')).not.toBeInTheDocument();
  });

  test('shows all recipes when currentUser is not provided', () => {
    render(
      <Kueche
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
      />
    );

    expect(screen.getByText('My Recipe')).toBeInTheDocument();
    expect(screen.getByText('Other Recipe')).toBeInTheDocument();
  });
});
