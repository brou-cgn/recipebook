import React from 'react';
import { render, screen } from '@testing-library/react';
import MenuDetail from './MenuDetail';

jest.mock('../utils/imageUtils', () => ({
  isBase64Image: jest.fn(() => false),
}));

jest.mock('../utils/userFavorites', () => ({
  getUserFavorites: () => Promise.resolve([]),
}));

jest.mock('../utils/menuFavorites', () => ({
  getUserMenuFavorites: () => Promise.resolve([]),
}));

jest.mock('../utils/menuSections', () => ({
  groupRecipesBySections: () => [],
}));

jest.mock('../utils/userManagement', () => ({
  canEditMenu: () => true,
  canDeleteMenu: () => true,
}));

jest.mock('../utils/customLists', () => ({
  getButtonIcons: () => Promise.resolve({ menuCloseButton: '✕' }),
}));

const mockMenu = {
  id: 'menu-1',
  name: 'Testmenü',
  recipeIds: [],
};

const currentUser = { id: 'user-1' };

describe('MenuDetail - Action Buttons', () => {
  test('renders favorite, edit and delete buttons', () => {
    render(
      <MenuDetail
        menu={mockMenu}
        recipes={[]}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onSelectRecipe={() => {}}
        onToggleMenuFavorite={() => Promise.resolve()}
        currentUser={currentUser}
        allUsers={[]}
      />
    );

    expect(screen.getByTitle(/Favoriten/i)).toBeInTheDocument();
    expect(screen.getByText('Bearbeiten')).toBeInTheDocument();
    expect(screen.getByText('Löschen')).toBeInTheDocument();
  });

  test('action-buttons container wraps all three buttons', () => {
    const { container } = render(
      <MenuDetail
        menu={mockMenu}
        recipes={[]}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onSelectRecipe={() => {}}
        onToggleMenuFavorite={() => Promise.resolve()}
        currentUser={currentUser}
        allUsers={[]}
      />
    );

    const actionButtons = container.querySelector('.action-buttons');
    expect(actionButtons).toBeInTheDocument();
    const buttons = actionButtons.querySelectorAll('button');
    expect(buttons.length).toBe(3);
  });
});
