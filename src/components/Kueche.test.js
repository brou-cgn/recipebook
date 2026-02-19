import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Kueche from './Kueche';

const DEFAULT_MENU_IMAGE = 'data:image/png;base64,defaultmenuimage';

jest.mock('../utils/customLists', () => ({
  getTimelineBubbleIcon: () => Promise.resolve(null),
  getTimelineMenuBubbleIcon: () => Promise.resolve(null),
  getTimelineMenuDefaultImage: () => Promise.resolve(DEFAULT_MENU_IMAGE),
}));

jest.mock('../utils/categoryImages', () => ({
  getCategoryImages: () => Promise.resolve([]),
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

  const mockMenus = [
    {
      id: 'm1',
      name: 'My Menu',
      createdAt: { toDate: () => new Date('2024-01-16') },
      recipeIds: ['1', '2'],
      authorId: 'user-1',
    },
    {
      id: 'm2',
      name: 'Other Menu',
      createdAt: { toDate: () => new Date('2024-01-18') },
      recipeIds: ['1'],
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

  test('shows only menus authored by the current user', () => {
    render(
      <Kueche
        recipes={[]}
        menus={mockMenus}
        onSelectRecipe={() => {}}
        onSelectMenu={() => {}}
        allUsers={mockUsers}
        currentUser={{ id: 'user-1' }}
      />
    );

    expect(screen.getByText('My Menu')).toBeInTheDocument();
    expect(screen.queryByText('Other Menu')).not.toBeInTheDocument();
  });

  test('menus appear in the combined timeline alongside recipes', () => {
    render(
      <Kueche
        recipes={mockRecipes}
        menus={mockMenus}
        onSelectRecipe={() => {}}
        onSelectMenu={() => {}}
        allUsers={mockUsers}
        currentUser={{ id: 'user-1' }}
      />
    );

    expect(screen.getByText('My Recipe')).toBeInTheDocument();
    expect(screen.getByText('My Menu')).toBeInTheDocument();
  });

  test('does not show menus belonging to other users in the timeline', () => {
    render(
      <Kueche
        recipes={mockRecipes}
        menus={mockMenus}
        onSelectRecipe={() => {}}
        onSelectMenu={() => {}}
        allUsers={mockUsers}
        currentUser={{ id: 'user-3' }}
      />
    );

    expect(screen.queryByText('My Menu')).not.toBeInTheDocument();
    expect(screen.queryByText('Other Menu')).not.toBeInTheDocument();
  });

  test('calls onSelectMenu when a menu card is clicked', () => {
    const handleSelectMenu = jest.fn();

    render(
      <Kueche
        recipes={[]}
        menus={[mockMenus[0]]}
        onSelectRecipe={() => {}}
        onSelectMenu={handleSelectMenu}
        allUsers={mockUsers}
        currentUser={{ id: 'user-1' }}
      />
    );

    fireEvent.click(screen.getByText('My Menu').closest('.timeline-card'));
    expect(handleSelectMenu).toHaveBeenCalledWith(mockMenus[0]);
  });

  test('menu uses menuDate for timeline ordering when set', () => {
    // A menu with menuDate different from createdAt; the timeline should use menuDate
    const menuWithMenuDate = {
      id: 'm4',
      name: 'Date Override Menu',
      createdAt: { toDate: () => new Date('2024-01-01') },
      menuDate: '2024-06-15',
      recipeIds: [],
      authorId: 'user-1',
    };

    render(
      <Kueche
        recipes={[]}
        menus={[menuWithMenuDate]}
        onSelectRecipe={() => {}}
        onSelectMenu={() => {}}
        allUsers={mockUsers}
        currentUser={{ id: 'user-1' }}
      />
    );

    // The timeline should show the date from menuDate (15. Juni 2024), not createdAt (01. Januar 2024)
    expect(screen.getByText('15. Juni 2024')).toBeInTheDocument();
    expect(screen.queryByText('01. Januar 2024')).not.toBeInTheDocument();
  });

  test('menus use createdBy field as fallback for authorId', () => {
    const menuWithCreatedBy = {
      id: 'm3',
      name: 'Created By Menu',
      createdAt: { toDate: () => new Date('2024-01-17') },
      recipeIds: [],
      createdBy: 'user-1',
    };

    render(
      <Kueche
        recipes={[]}
        menus={[menuWithCreatedBy]}
        onSelectRecipe={() => {}}
        onSelectMenu={() => {}}
        allUsers={mockUsers}
        currentUser={{ id: 'user-1' }}
      />
    );

    expect(screen.getByText('Created By Menu')).toBeInTheDocument();
  });

  test('menu items in the combined timeline display the default image', async () => {
    const menu = {
      id: 'm5',
      name: 'Image Menu',
      createdAt: { toDate: () => new Date('2024-02-01') },
      recipeIds: ['1'],
      authorId: 'user-1',
    };

    render(
      <Kueche
        recipes={[]}
        menus={[menu]}
        onSelectRecipe={() => {}}
        onSelectMenu={() => {}}
        allUsers={mockUsers}
        currentUser={{ id: 'user-1' }}
      />
    );

    const img = await screen.findByAltText('Image Menu');
    expect(img).toHaveAttribute('src', DEFAULT_MENU_IMAGE);
  });
});
