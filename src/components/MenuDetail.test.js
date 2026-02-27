import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MenuDetail from './MenuDetail';

jest.mock('./ShoppingListModal', () => function MockShoppingListModal({ items }) {
  return (
    <ul data-testid="shopping-list">
      {(items || []).map((item, i) => (
        <li key={i} data-testid="shopping-item">{item}</li>
      ))}
    </ul>
  );
});

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
  getCustomLists: () => Promise.resolve({ conversionTable: [] }),
  addMissingConversionEntries: jest.fn(() => Promise.resolve()),
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

  test('action-buttons container wraps all buttons except delete', () => {
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

  test('delete button is not inside action-buttons', () => {
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
    const deleteInHeader = actionButtons.querySelector('.delete-button');
    expect(deleteInHeader).not.toBeInTheDocument();
  });

  test('delete button is inside menu-delete-actions below the content', () => {
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

    const deleteActions = container.querySelector('.menu-delete-actions');
    expect(deleteActions).toBeInTheDocument();
    const deleteButton = deleteActions.querySelector('.delete-button');
    expect(deleteButton).toBeInTheDocument();
    expect(deleteButton).toHaveTextContent('Löschen');

    // Verify menu-delete-actions appears after menu-detail-content
    const menuContent = container.querySelector('.menu-detail-content');
    expect(
      menuContent.compareDocumentPosition(deleteActions) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
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

describe('MenuDetail - Shopping List with Linked Recipes', () => {
  const pizzateigRecipe = {
    id: 'pizzateig',
    title: 'Pizzateig',
    portionen: 8,
    ingredients: ['500 g Mehl', '300 ml Wasser', '10 g Salz'],
  };

  const makePizzaRecipe = (id) => ({
    id,
    title: `Pizza ${id}`,
    portionen: 4,
    ingredients: ['1 Teil #recipe:pizzateig:Pizzateig', '200 g Tomatensoße'],
  });

  const menuWith6Pizzas = {
    id: 'menu-pizza',
    name: 'Pizza-Menü',
    recipeIds: ['pizza-1', 'pizza-2', 'pizza-3', 'pizza-4', 'pizza-5', 'pizza-6'],
  };

  const recipes6Pizzas = [
    pizzateigRecipe,
    ...['pizza-1', 'pizza-2', 'pizza-3', 'pizza-4', 'pizza-5', 'pizza-6'].map(makePizzaRecipe),
  ];

  const openShoppingList = async (menu, recipes) => {
    render(
      <MenuDetail
        menu={menu}
        recipes={recipes}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onSelectRecipe={() => {}}
        onToggleMenuFavorite={() => Promise.resolve()}
        currentUser={{ id: 'user-1' }}
        allUsers={[]}
      />
    );
    fireEvent.click(screen.getByLabelText('Einkaufsliste öffnen'));
    fireEvent.click(await screen.findByText('Einkaufsliste erstellen'));
    return screen.findAllByTestId('shopping-item');
  };

  test('6 pizzas each using 1 Teil Pizzateig gives scaled Mehl (not 6x the full recipe)', async () => {
    const items = await openShoppingList(menuWith6Pizzas, recipes6Pizzas);
    const texts = items.map((el) => el.textContent);
    // 6 pizzas × 1 Teil out of 8 Teile = 0.75 → 500 g × 0.75 = 375 g
    expect(texts).toContain('375 g Mehl');
    // Water should be skipped
    expect(texts.some((t) => t.toLowerCase().includes('wasser'))).toBe(false);
  });

  test('linked recipe ingredients appear exactly once (not once per main recipe)', async () => {
    const items = await openShoppingList(menuWith6Pizzas, recipes6Pizzas);
    const texts = items.map((el) => el.textContent);
    // Mehl should be combined into a single entry
    expect(texts.filter((t) => t.includes('Mehl'))).toHaveLength(1);
  });

  test('2 pizzas each using 0.5 Teil Pizzateig scales correctly', async () => {
    const menuWith2Pizzas = {
      id: 'menu-pizza-2',
      name: 'Pizza-Menü-2',
      recipeIds: ['pizza-a', 'pizza-b'],
    };
    const pizzaWith0_5Teil = (id) => ({
      id,
      title: `Pizza ${id}`,
      portionen: 4,
      ingredients: ['0.5 Teil #recipe:pizzateig:Pizzateig'],
    });
    const recipes = [
      pizzateigRecipe,
      pizzaWith0_5Teil('pizza-a'),
      pizzaWith0_5Teil('pizza-b'),
    ];
    const items = await openShoppingList(menuWith2Pizzas, recipes);
    const texts = items.map((el) => el.textContent);
    // 2 pizzas × 0.5 Teil = 1 Teil out of 8 = 0.125 → 500 g × 0.125 = 62.5 g
    expect(texts).toContain('62.5 g Mehl');
  });

  test('recipe link without quantityPrefix defaults to 1 Teil', async () => {
    const menuSingle = {
      id: 'menu-single',
      name: 'Single Pizza',
      recipeIds: ['pizza-plain'],
    };
    const pizzaWithNoPrefix = {
      id: 'pizza-plain',
      title: 'Plain Pizza',
      portionen: 4,
      ingredients: ['#recipe:pizzateig:Pizzateig'],
    };
    const recipes = [pizzateigRecipe, pizzaWithNoPrefix];
    const items = await openShoppingList(menuSingle, recipes);
    const texts = items.map((el) => el.textContent);
    // 1 Teil (default) out of 8 = 0.125 → 500 g × 0.125 = 62.5 g
    expect(texts).toContain('62.5 g Mehl');
  });

  test('recipe with 0 portions contributes no ingredients to the shopping list', async () => {
    const recipeZero = {
      id: 'recipe-zero',
      title: 'Zero Portions Recipe',
      portionen: 4,
      ingredients: ['100 g Butter'],
    };
    const recipeNormal = {
      id: 'recipe-normal',
      title: 'Normal Recipe',
      portionen: 4,
      ingredients: ['200 g Zucker'],
    };
    const menuWithZero = {
      id: 'menu-zero',
      name: 'Zero Test Menü',
      recipeIds: ['recipe-zero', 'recipe-normal'],
      portionCounts: { 'recipe-zero': 0 },
    };
    const items = await openShoppingList(menuWithZero, [recipeZero, recipeNormal]);
    const texts = items.map((el) => el.textContent);
    // recipe-zero is set to 0 portions → its ingredients must not appear
    expect(texts.some((t) => t.toLowerCase().includes('butter'))).toBe(false);
    // recipe-normal has default portions → its ingredients must appear
    expect(texts).toContain('200 g Zucker');
  });
});
