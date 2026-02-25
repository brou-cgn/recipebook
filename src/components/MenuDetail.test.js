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

jest.mock('../utils/customLists', () => ({
  getButtonIcons: () => Promise.resolve({ menuCloseButton: '✕', copyLink: '📋' }),
}));

jest.mock('../utils/userManagement', () => ({
  canEditMenu: () => true,
  canDeleteMenu: () => true,
}));

jest.mock('../utils/menuFirestore', () => ({
  enableMenuSharing: jest.fn(() => Promise.resolve('new-share-id')),
  disableMenuSharing: jest.fn(() => Promise.resolve()),
}));

const mockMenu = {
  id: 'menu-1',
  name: 'Testmenü',
  recipeIds: [],
};

const mockMenuWithMeta = {
  id: 'menu-2',
  name: 'Testmenü mit Metadaten',
  description: 'Eine Beschreibung',
  menuDate: '2024-01-15',
  authorId: 'user-1',
  recipeIds: [],
};

const currentUser = { id: 'user-1' };

describe('MenuDetail - Action Buttons', () => {
  test('renders favorite, edit, delete and share buttons', () => {
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
    expect(screen.getByTitle('Menü teilen')).toBeInTheDocument();
  });

  test('action-buttons container wraps all four buttons', () => {
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
    expect(buttons.length).toBe(4);
  });
});

describe('MenuDetail - Close Button in Title Row', () => {
  test('close button is inside menu-title-row', () => {
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

    const titleRow = container.querySelector('.menu-title-row');
    expect(titleRow).toBeInTheDocument();
    const closeButton = titleRow.querySelector('.close-button');
    expect(closeButton).toBeInTheDocument();
  });

  test('close button is not inside menu-detail-header', () => {
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

    const header = container.querySelector('.menu-detail-header');
    expect(header).toBeInTheDocument();
    const closeButtonInHeader = header.querySelector('.close-button');
    expect(closeButtonInHeader).not.toBeInTheDocument();
  });
});

describe('MenuDetail - Share Buttons', () => {
  test('shows Teilen button for menu without shareId', () => {
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

    expect(screen.getByTitle('Menü teilen')).toBeInTheDocument();
  });

  test('hides Teilen button for menu with shareId', () => {
    const sharedMenu = { ...mockMenu, shareId: 'some-share-id' };

    render(
      <MenuDetail
        menu={sharedMenu}
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

    expect(screen.queryByTitle('Menü teilen')).toBeNull();
  });

  test('shows copy link button for menu with shareId', () => {
    const sharedMenu = { ...mockMenu, shareId: 'some-share-id' };

    render(
      <MenuDetail
        menu={sharedMenu}
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

    expect(screen.getByTitle('Share-Link kopieren')).toBeInTheDocument();
  });
});

describe('MenuDetail - Metadata before Description', () => {
  test('metadata (author/date) appears before description in the DOM', () => {
    const { container } = render(
      <MenuDetail
        menu={mockMenuWithMeta}
        recipes={[]}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onSelectRecipe={() => {}}
        onToggleMenuFavorite={() => Promise.resolve()}
        currentUser={currentUser}
        allUsers={[{ id: 'user-1', vorname: 'Max', nachname: 'Mustermann' }]}
      />
    );

    const description = container.querySelector('.menu-description');
    const authorDate = container.querySelector('.menu-author-date');

    expect(description).toBeInTheDocument();
    expect(authorDate).toBeInTheDocument();

    // Verify metadata appears before description in the DOM
    expect(
      authorDate.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});
