import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
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

jest.mock('../utils/userManagement', () => ({
  updateUserProfile: jest.fn(() => Promise.resolve({ success: true, message: 'Profil erfolgreich aktualisiert.' })),
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

    fireEvent.click(screen.getByRole('button', { name: /Meine Küche/i }));
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

    fireEvent.click(screen.getByRole('button', { name: /Meine Küche/i }));
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

    fireEvent.click(screen.getByRole('button', { name: /Meine Küche/i }));
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

    fireEvent.click(screen.getByRole('button', { name: /Meine Küche/i }));
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

    fireEvent.click(screen.getByRole('button', { name: /Meine Küche/i }));
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

    fireEvent.click(screen.getByRole('button', { name: /Meine Küche/i }));
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

    fireEvent.click(screen.getByRole('button', { name: /Meine Küche/i }));
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

    fireEvent.click(screen.getByRole('button', { name: /Meine Küche/i }));
    const img = await screen.findByAltText('Image Menu');
    expect(img).toHaveAttribute('src', DEFAULT_MENU_IMAGE);
  });

  test('renders the Chefkoch tile with the current user full name', () => {
    render(
      <Kueche
        recipes={mockRecipes}
        menus={mockMenus}
        onSelectRecipe={() => {}}
        onSelectMenu={() => {}}
        allUsers={mockUsers}
        currentUser={{ id: 'user-1', vorname: 'John', nachname: 'Doe' }}
      />
    );

    expect(screen.getByText('Chefkoch')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  test('renders the Chefkoch tile without name when currentUser is not provided', () => {
    render(
      <Kueche
        recipes={mockRecipes}
        menus={mockMenus}
        onSelectRecipe={() => {}}
        onSelectMenu={() => {}}
        allUsers={mockUsers}
      />
    );

    expect(screen.getByText('Chefkoch')).toBeInTheDocument();
    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
  });

  test('Chefkoch tile has the kueche-tile--chefkoch CSS class', () => {
    render(
      <Kueche
        recipes={[]}
        menus={[]}
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
        currentUser={{ id: 'user-1', vorname: 'John', nachname: 'Doe' }}
      />
    );

    const chefkochTile = screen.getByRole('button', { name: /Chefkoch persönliche Daten/i });
    expect(chefkochTile).toHaveClass('kueche-tile--chefkoch');
  });

  test('clicking Chefkoch tile shows the PersonalDataPage', () => {
    render(
      <Kueche
        recipes={[]}
        menus={[]}
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
        currentUser={{ id: 'user-1', vorname: 'John', nachname: 'Doe', email: 'john@example.com' }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Chefkoch persönliche Daten/i }));
    expect(screen.getByText('Persönliche Daten')).toBeInTheDocument();
  });

  test('PersonalDataPage back button returns to Kueche', () => {
    render(
      <Kueche
        recipes={[]}
        menus={[]}
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
        currentUser={{ id: 'user-1', vorname: 'John', nachname: 'Doe', email: 'john@example.com' }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Chefkoch persönliche Daten/i }));
    expect(screen.getByText('Persönliche Daten')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Zurück/i }));
    expect(screen.getByText('Chefkoch')).toBeInTheDocument();
    expect(screen.queryByText('Persönliche Daten')).not.toBeInTheDocument();
  });

  test('renders the info tile above the timeline with recipe and menu counts', () => {
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

    expect(screen.getByText('Mein Kochbuch')).toBeInTheDocument();
    expect(screen.getAllByText('1')).toHaveLength(2);
    expect(screen.getByText('Rezept')).toBeInTheDocument();
    expect(screen.getByText('Menü')).toBeInTheDocument();
  });

  test('info tile shows plural forms for multiple recipes and menus', () => {
    render(
      <Kueche
        recipes={mockRecipes}
        menus={mockMenus}
        onSelectRecipe={() => {}}
        onSelectMenu={() => {}}
        allUsers={mockUsers}
        currentUser={null}
      />
    );

    expect(screen.getAllByText('2')).toHaveLength(2);
    expect(screen.getByText('Rezepte')).toBeInTheDocument();
    expect(screen.getByText('Menüs')).toBeInTheDocument();
  });

  test('timeline is hidden by default and shown after clicking the tile', () => {
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

    expect(screen.queryByText('My Recipe')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Meine Küche/i }));
    expect(screen.getByText('My Recipe')).toBeInTheDocument();
  });

  test('clicking the tile again hides the timeline', () => {
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

    const tile = screen.getByRole('button', { name: /Meine Küche/i });
    fireEvent.click(tile);
    expect(screen.getByText('My Recipe')).toBeInTheDocument();

    fireEvent.click(tile);
    expect(screen.queryByText('My Recipe')).not.toBeInTheDocument();
  });

  test('renders the bar chart in the Mein Kochbuch tile', () => {
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

    const chart = screen.getByTestId('recipe-bar-chart');
    expect(chart).toBeInTheDocument();
    expect(chart.children).toHaveLength(6);
  });

  test('current month bar has the --current CSS class', () => {
    const now = new Date();
    const recipeThisMonth = {
      id: '3',
      title: 'New Recipe',
      createdAt: { toDate: () => new Date(now.getFullYear(), now.getMonth(), 5) },
      ingredients: [],
      steps: [],
      authorId: 'user-1',
    };

    render(
      <Kueche
        recipes={[recipeThisMonth]}
        menus={[]}
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
        currentUser={{ id: 'user-1' }}
      />
    );

    const chart = screen.getByTestId('recipe-bar-chart');
    const bars = Array.from(chart.children);
    expect(bars[5]).toHaveClass('kueche-bar-chart__bar--current');
    bars.slice(0, 5).forEach(bar => {
      expect(bar).not.toHaveClass('kueche-bar-chart__bar--current');
    });
  });

  test('bar chart only counts recipes belonging to the current user', () => {
    const now = new Date();
    const userRecipe = {
      id: '3',
      title: 'My Current Recipe',
      createdAt: { toDate: () => new Date(now.getFullYear(), now.getMonth(), 5) },
      ingredients: [],
      steps: [],
      authorId: 'user-1',
    };
    const otherRecipe = {
      id: '4',
      title: 'Other Current Recipe',
      createdAt: { toDate: () => new Date(now.getFullYear(), now.getMonth(), 6) },
      ingredients: [],
      steps: [],
      authorId: 'user-2',
    };

    render(
      <Kueche
        recipes={[userRecipe, otherRecipe]}
        menus={[]}
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
        currentUser={{ id: 'user-1' }}
      />
    );

    const chart = screen.getByTestId('recipe-bar-chart');
    const currentBar = Array.from(chart.children)[5];
    // Current month bar should be at 100% height (1 recipe = max)
    expect(currentBar.style.height).toBe('100%');
  });

  const mockGroups = [
    { id: 'g1', type: 'private', ownerId: 'user-1', name: 'My List', memberIds: [] },
    { id: 'g2', type: 'private', ownerId: 'user-2', name: 'Other List', memberIds: [] },
    { id: 'g3', type: 'public', ownerId: null, name: 'Public', memberIds: [] },
  ];

  test('Mise en Place tile shows private list count for current user', () => {
    render(
      <Kueche
        recipes={[]}
        menus={[]}
        groups={mockGroups}
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
        currentUser={{ id: 'user-1' }}
      />
    );

    const tile = screen.getByTestId('mise-en-place-tile');
    expect(within(tile).getByText('1')).toBeInTheDocument();
    expect(within(tile).getByText('private Liste')).toBeInTheDocument();
  });

  test('Mise en Place tile shows plural for multiple private lists', () => {
    const multipleGroups = [
      { id: 'g1', type: 'private', ownerId: 'user-1', name: 'List 1', memberIds: [] },
      { id: 'g2', type: 'private', ownerId: 'user-1', name: 'List 2', memberIds: [] },
    ];
    render(
      <Kueche
        recipes={[]}
        menus={[]}
        groups={multipleGroups}
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
        currentUser={{ id: 'user-1' }}
      />
    );

    const tile = screen.getByTestId('mise-en-place-tile');
    expect(within(tile).getByText('2')).toBeInTheDocument();
    expect(within(tile).getByText('private Listen')).toBeInTheDocument();
  });

  test('Mise en Place tile shows 0 private Listen when no groups provided', () => {
    render(
      <Kueche
        recipes={[]}
        menus={[]}
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
        currentUser={{ id: 'user-1' }}
      />
    );

    const tile = screen.getByTestId('mise-en-place-tile');
    expect(within(tile).getByText('0')).toBeInTheDocument();
    expect(within(tile).getByText('private Listen')).toBeInTheDocument();
  });

  test('Mise en Place tile only counts groups owned by current user', () => {
    render(
      <Kueche
        recipes={[]}
        menus={[]}
        groups={mockGroups}
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
        currentUser={{ id: 'user-2' }}
      />
    );

    const tile = screen.getByTestId('mise-en-place-tile');
    expect(within(tile).getByText('1')).toBeInTheDocument();
    expect(within(tile).getByText('private Liste')).toBeInTheDocument();
  });

  test('Meine Mise en Place tile appears before Mein Kochbuch tile', () => {
    render(
      <Kueche
        recipes={[]}
        menus={[]}
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
        currentUser={{ id: 'user-1' }}
      />
    );

    const miseEnPlace = screen.getByTestId('mise-en-place-tile');
    const kochbuchTile = screen.getByRole('button', { name: /Toggle Meine Küche timeline/i });
    expect(miseEnPlace.compareDocumentPosition(kochbuchTile)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
