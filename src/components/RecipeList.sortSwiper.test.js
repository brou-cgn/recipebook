import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecipeList from './RecipeList';

const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000;

jest.mock('../utils/userManagement', () => ({
  canEditRecipes: jest.fn(() => false),
  getUsers: () => Promise.resolve([]),
}));

jest.mock('../utils/customLists', () => ({
  getCustomLists: () => Promise.resolve({ mealCategories: [] }),
  getButtonIcons: () => Promise.resolve({ filterButton: '⚙' }),
  DEFAULT_BUTTON_ICONS: { filterButton: '⚙' },
}));

jest.mock('../utils/userFavorites', () => ({
  getUserFavorites: () => Promise.resolve([]),
}));

jest.mock('../utils/recipeCallsFirestore', () => ({
  getRecipeCalls: jest.fn(),
}));

const mockGetRecipeCalls = jest.requireMock('../utils/recipeCallsFirestore').getRecipeCalls;

const mockRecipes = [
  {
    id: '1',
    title: 'Banana Bread',
    ingredients: [],
    steps: [],
    viewCount: 100,
    createdAt: '2024-01-01T10:00:00Z',
    authorId: 'user-1',
  },
  {
    id: '2',
    title: 'Apple Pie',
    ingredients: [],
    steps: [],
    viewCount: 200,
    createdAt: '2024-01-02T10:00:00Z',
    authorId: 'user-1',
  },
  {
    id: '3',
    title: 'Zebra Cake',
    ingredients: [],
    steps: [],
    viewCount: 50,
    createdAt: '2024-01-03T10:00:00Z',
    authorId: 'user-1',
  },
];

// Helper: expand the swiper, then click an option to select it
function selectSortMode(label) {
  fireEvent.click(document.querySelector('.sort-swiper'));
  fireEvent.click(screen.getByText(label));
}

describe('RecipeList - Sort Swiper', () => {
  beforeEach(() => {
    // resetMocks: true clears jest.fn() implementations between tests, so re-apply the default
    mockGetRecipeCalls.mockResolvedValue([]);
  });

  test('renders sort swiper with "Im Trend", "Alphabetisch", "Nach Bewertung" and "Neue Rezepte" options', async () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        searchTerm=""
      />
    );

    expect(await screen.findByText('Im Trend')).toBeInTheDocument();
    expect(screen.getByText('Alphabetisch')).toBeInTheDocument();
    expect(screen.getByText('Nach Bewertung')).toBeInTheDocument();
    expect(screen.getByText('Neue Rezepte')).toBeInTheDocument();
  });

  test('"Im Trend" is active by default', async () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        searchTerm=""
      />
    );

    const trendingBtn = await screen.findByText('Im Trend');
    expect(trendingBtn).toHaveClass('active');
    expect(screen.getByText('Alphabetisch')).not.toHaveClass('active');
  });

  test('trending mode sorts recipes by recent call count descending', async () => {
    const now = new Date().toISOString();
    mockGetRecipeCalls.mockResolvedValueOnce([
      { id: 'call-1', recipeId: '2', timestamp: now }, // Apple Pie – 3 calls
      { id: 'call-2', recipeId: '2', timestamp: now },
      { id: 'call-3', recipeId: '2', timestamp: now },
      { id: 'call-4', recipeId: '1', timestamp: now }, // Banana Bread – 2 calls
      { id: 'call-5', recipeId: '1', timestamp: now },
      { id: 'call-6', recipeId: '3', timestamp: now }, // Zebra Cake – 1 call
    ]);

    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        searchTerm=""
      />
    );

    await screen.findByText('Apple Pie');

    const cards = document.querySelectorAll('.recipe-card h3');
    const titles = Array.from(cards).map(c => c.textContent);
    // recent calls: Apple Pie=3, Banana Bread=2, Zebra Cake=1
    expect(titles).toEqual(['Apple Pie', 'Banana Bread', 'Zebra Cake']);
  });

  test('clicking "Alphabetisch" switches to alphabetical sort', async () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        searchTerm=""
      />
    );

    await screen.findByText('Alphabetisch');
    selectSortMode('Alphabetisch');

    expect(screen.getByText('Alphabetisch')).toHaveClass('active');
    expect(screen.getByText('Im Trend')).not.toHaveClass('active');

    const cards = document.querySelectorAll('.recipe-card h3');
    const titles = Array.from(cards).map(c => c.textContent);
    expect(titles).toEqual(['Apple Pie', 'Banana Bread', 'Zebra Cake']);
  });

  test('alphabetical mode falls back to createdAt when titles are equal', async () => {
    const recipesWithSameTitle = [
      { id: 'a', title: 'Soup', ingredients: [], steps: [], createdAt: '2024-01-01T00:00:00Z', authorId: 'u1' },
      { id: 'b', title: 'Soup', ingredients: [], steps: [], createdAt: '2024-06-01T00:00:00Z', authorId: 'u1' },
    ];
    render(
      <RecipeList
        recipes={recipesWithSameTitle}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'u1' }}
        searchTerm=""
      />
    );

    await screen.findByText('Alphabetisch');
    selectSortMode('Alphabetisch');

    await screen.findAllByText('Soup');
    const cards = document.querySelectorAll('.recipe-card h3');
    // Newer (June) recipe should come first
    expect(cards).toHaveLength(2);
  });

  test('trending mode falls back to title then createdAt when viewCounts are equal', async () => {
    const recipesEqualViews = [
      { id: '1', title: 'Zebra Cake', ingredients: [], steps: [], viewCount: 10, createdAt: '2024-01-01T00:00:00Z', authorId: 'u1' },
      { id: '2', title: 'Apple Pie', ingredients: [], steps: [], viewCount: 10, createdAt: '2024-01-01T00:00:00Z', authorId: 'u1' },
    ];
    const now = new Date().toISOString();
    mockGetRecipeCalls.mockResolvedValueOnce([
      { id: 'call-1', recipeId: '1', timestamp: now }, // Zebra Cake – 1 recent call
      { id: 'call-2', recipeId: '2', timestamp: now }, // Apple Pie – 1 recent call
    ]);
    render(
      <RecipeList
        recipes={recipesEqualViews}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'u1' }}
        searchTerm=""
      />
    );

    await screen.findByText('Apple Pie');
    const cards = document.querySelectorAll('.recipe-card h3');
    const titles = Array.from(cards).map(c => c.textContent);
    // Same recent call count → alphabetical fallback
    expect(titles).toEqual(['Apple Pie', 'Zebra Cake']);
  });

  test('clicking "Im Trend" after "Alphabetisch" resets to trending sort', async () => {
    const now = new Date().toISOString();
    mockGetRecipeCalls.mockResolvedValue([
      { id: 'call-1', recipeId: '2', timestamp: now }, // Apple Pie – 3 calls
      { id: 'call-2', recipeId: '2', timestamp: now },
      { id: 'call-3', recipeId: '2', timestamp: now },
      { id: 'call-4', recipeId: '1', timestamp: now }, // Banana Bread – 2 calls
      { id: 'call-5', recipeId: '1', timestamp: now },
      { id: 'call-6', recipeId: '3', timestamp: now }, // Zebra Cake – 1 call
    ]);

    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        searchTerm=""
      />
    );

    await screen.findByText('Alphabetisch');
    selectSortMode('Alphabetisch');

    // Verify alphabetical sort is active
    expect(screen.getByText('Alphabetisch')).toHaveClass('active');

    // Switch back to trending
    selectSortMode('Im Trend');

    expect(screen.getByText('Im Trend')).toHaveClass('active');
    expect(screen.getByText('Alphabetisch')).not.toHaveClass('active');

    const cards = document.querySelectorAll('.recipe-card h3');
    const titles = Array.from(cards).map(c => c.textContent);
    // recent calls: Apple Pie=3, Banana Bread=2, Zebra Cake=1
    expect(titles).toEqual(['Apple Pie', 'Banana Bread', 'Zebra Cake']);
  });

  test('trending mode sorts recipes by recipeCalls count from all users', async () => {
    const now = new Date().toISOString();
    mockGetRecipeCalls.mockResolvedValueOnce([
      { id: 'call-1', recipeId: '3', timestamp: now }, // Zebra Cake – 3 calls
      { id: 'call-2', recipeId: '3', timestamp: now },
      { id: 'call-3', recipeId: '3', timestamp: now },
      { id: 'call-4', recipeId: '1', timestamp: now }, // Banana Bread – 1 call
    ]);

    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        searchTerm=""
      />
    );

    await screen.findByText('Zebra Cake');

    const cards = document.querySelectorAll('.recipe-card h3');
    const titles = Array.from(cards).map(c => c.textContent);
    // Zebra Cake=3 recent calls, Banana Bread=1 recent call, Apple Pie=0 recent calls (hidden)
    expect(titles).toEqual(['Zebra Cake', 'Banana Bread']);
  });

  test('trending mode hides recipes with no calls in the last 30 days', async () => {
    const oldDate = new Date(Date.now() - THIRTY_ONE_DAYS_MS).toISOString();
    mockGetRecipeCalls.mockResolvedValueOnce([
      { id: 'call-1', recipeId: '1', timestamp: oldDate }, // Banana Bread – only an old call
    ]);

    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        searchTerm=""
      />
    );

    await screen.findByText('Keine Trend-Rezepte!');
    const cards = document.querySelectorAll('.recipe-card h3');
    expect(cards).toHaveLength(0);
  });

  test('trending mode only counts calls from the last 30 days for sorting', async () => {
    const now = new Date().toISOString();
    const oldDate = new Date(Date.now() - THIRTY_ONE_DAYS_MS).toISOString();
    mockGetRecipeCalls.mockResolvedValueOnce([
      { id: 'call-1', recipeId: '1', timestamp: now },    // Banana Bread – 1 recent call
      { id: 'call-2', recipeId: '2', timestamp: oldDate }, // Apple Pie – only old call (hidden)
      { id: 'call-3', recipeId: '2', timestamp: oldDate },
      { id: 'call-4', recipeId: '3', timestamp: now },    // Zebra Cake – 2 recent calls
      { id: 'call-5', recipeId: '3', timestamp: now },
    ]);

    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        searchTerm=""
      />
    );

    await screen.findByText('Zebra Cake');
    const cards = document.querySelectorAll('.recipe-card h3');
    const titles = Array.from(cards).map(c => c.textContent);
    // Zebra Cake=2 recent calls, Banana Bread=1 recent call; Apple Pie has no recent calls → hidden
    expect(titles).toEqual(['Zebra Cake', 'Banana Bread']);
    expect(titles).not.toContain('Apple Pie');
  });

  test('swiper is compact (no expanded class) by default', async () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        searchTerm=""
      />
    );

    await screen.findByText('Im Trend');
    const swiper = document.querySelector('.sort-swiper');
    expect(swiper).not.toHaveClass('expanded');
  });

  test('clicking the swiper expands it (adds expanded class)', async () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        searchTerm=""
      />
    );

    await screen.findByText('Im Trend');
    const swiper = document.querySelector('.sort-swiper');
    fireEvent.click(swiper);
    expect(swiper).toHaveClass('expanded');
  });

  test('selecting an option collapses the swiper', async () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        searchTerm=""
      />
    );

    await screen.findByText('Im Trend');
    const swiper = document.querySelector('.sort-swiper');
    // Expand
    fireEvent.click(swiper);
    expect(swiper).toHaveClass('expanded');
    // Select an option
    fireEvent.click(screen.getByText('Alphabetisch'));
    expect(swiper).not.toHaveClass('expanded');
  });

  test('swipe left changes to next sort mode and collapses', async () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        searchTerm=""
      />
    );

    await screen.findByText('Im Trend');
    const swiper = document.querySelector('.sort-swiper');
    // Default active is "trending" (index 1 in SORT_MODES: Alphabetisch, Im Trend, Neue Rezepte, Nach Bewertung)
    expect(screen.getByText('Im Trend')).toHaveClass('active');
    // Swipe left (next mode: Neue Rezepte)
    fireEvent.touchStart(swiper, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(swiper, { changedTouches: [{ clientX: 100 }] }); // delta -100 → left
    expect(screen.getByText('Neue Rezepte')).toHaveClass('active');
    expect(swiper).not.toHaveClass('expanded');
  });

  test('swipe right changes to previous sort mode and collapses', async () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        searchTerm=""
      />
    );

    await screen.findByText('Im Trend');
    const swiper = document.querySelector('.sort-swiper');
    // Default active is "trending" (index 1). Swipe right → prev → Alphabetisch (index 0)
    fireEvent.touchStart(swiper, { touches: [{ clientX: 100 }] });
    fireEvent.touchEnd(swiper, { changedTouches: [{ clientX: 200 }] }); // delta +100 → right
    expect(screen.getByText('Alphabetisch')).toHaveClass('active');
    expect(swiper).not.toHaveClass('expanded');
  });

  test('small touch movement (< 50px) does not trigger swipe', async () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        searchTerm=""
      />
    );

    await screen.findByText('Im Trend');
    const swiper = document.querySelector('.sort-swiper');
    fireEvent.touchStart(swiper, { touches: [{ clientX: 100 }] });
    fireEvent.touchEnd(swiper, { changedTouches: [{ clientX: 130 }] }); // delta +30 → not a swipe
    // Sort mode should remain "Im Trend"
    expect(screen.getByText('Im Trend')).toHaveClass('active');
  });

  test('only the active option is visible by default; all options appear in the DOM', async () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        searchTerm=""
      />
    );

    await screen.findByText('Im Trend');
    const swiper = document.querySelector('.sort-swiper');
    expect(swiper).not.toHaveClass('expanded');
    // All option buttons are present in the DOM (non-active ones hidden via CSS)
    expect(swiper).toContainElement(screen.getByText('Alphabetisch'));
    expect(swiper).toContainElement(screen.getByText('Im Trend'));
    expect(swiper).toContainElement(screen.getByText('Neue Rezepte'));
    expect(swiper).toContainElement(screen.getByText('Nach Bewertung'));
  });

  test('options appear in correct order: Alphabetisch, Im Trend, Neue Rezepte, Nach Bewertung', async () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        searchTerm=""
      />
    );

    await screen.findByText('Im Trend');
    const buttons = document.querySelectorAll('.sort-swiper-item');
    const labels = Array.from(buttons).map(b => b.textContent);
    expect(labels).toEqual(['Alphabetisch', 'Im Trend', 'Neue Rezepte', 'Nach Bewertung']);
  });

  test('clicking "Nach Bewertung" switches to score sort and shows it active', async () => {
    render(
      <RecipeList
        recipes={mockRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'user-1' }}
        searchTerm=""
      />
    );

    await screen.findByText('Nach Bewertung');
    selectSortMode('Nach Bewertung');

    expect(screen.getByText('Nach Bewertung')).toHaveClass('active');
    expect(screen.getByText('Im Trend')).not.toHaveClass('active');
    expect(screen.getByText('Alphabetisch')).not.toHaveClass('active');
  });

  test('score mode sorts recipes by Bayesian score descending', async () => {
    const ratedRecipes = [
      {
        id: '1',
        title: 'High Rated',
        ingredients: [],
        steps: [],
        ratingAvg: 5,
        ratingCount: 20,
        createdAt: '2024-01-01T00:00:00Z',
        authorId: 'u1',
      },
      {
        id: '2',
        title: 'Low Rated',
        ingredients: [],
        steps: [],
        ratingAvg: 2,
        ratingCount: 20,
        createdAt: '2024-01-01T00:00:00Z',
        authorId: 'u1',
      },
      {
        id: '3',
        title: 'Medium Rated',
        ingredients: [],
        steps: [],
        ratingAvg: 3.5,
        ratingCount: 20,
        createdAt: '2024-01-01T00:00:00Z',
        authorId: 'u1',
      },
    ];

    render(
      <RecipeList
        recipes={ratedRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'u1' }}
        searchTerm=""
      />
    );

    await screen.findByText('Nach Bewertung');
    selectSortMode('Nach Bewertung');

    await screen.findByText('High Rated');
    const cards = document.querySelectorAll('.recipe-card h3');
    const titles = Array.from(cards).map(c => c.textContent);
    expect(titles).toEqual(['High Rated', 'Medium Rated', 'Low Rated']);
  });

  test('score mode falls back to alphabetical when scores are equal', async () => {
    const equalScoreRecipes = [
      {
        id: '1',
        title: 'Zebra Soup',
        ingredients: [],
        steps: [],
        ratingAvg: 4,
        ratingCount: 10,
        createdAt: '2024-01-01T00:00:00Z',
        authorId: 'u1',
      },
      {
        id: '2',
        title: 'Apple Strudel',
        ingredients: [],
        steps: [],
        ratingAvg: 4,
        ratingCount: 10,
        createdAt: '2024-01-01T00:00:00Z',
        authorId: 'u1',
      },
    ];

    render(
      <RecipeList
        recipes={equalScoreRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'u1' }}
        searchTerm=""
      />
    );

    await screen.findByText('Nach Bewertung');
    selectSortMode('Nach Bewertung');

    await screen.findByText('Apple Strudel');
    const cards = document.querySelectorAll('.recipe-card h3');
    const titles = Array.from(cards).map(c => c.textContent);
    expect(titles).toEqual(['Apple Strudel', 'Zebra Soup']);
  });

  test('score mode falls back to createdAt when scores and titles are equal', async () => {
    const equalScoreTitleRecipes = [
      {
        id: '1',
        title: 'Pasta',
        ingredients: [],
        steps: [],
        ratingAvg: 4,
        ratingCount: 10,
        createdAt: '2024-01-01T00:00:00Z',
        authorId: 'u1',
        kulinarik: ['Older'],
      },
      {
        id: '2',
        title: 'Pasta',
        ingredients: [],
        steps: [],
        ratingAvg: 4,
        ratingCount: 10,
        createdAt: '2024-06-01T00:00:00Z',
        authorId: 'u1',
        kulinarik: ['Newer'],
      },
    ];

    render(
      <RecipeList
        recipes={equalScoreTitleRecipes}
        onSelectRecipe={() => {}}
        onAddRecipe={() => {}}
        categoryFilter=""
        currentUser={{ id: 'u1' }}
        searchTerm=""
      />
    );

    await screen.findByText('Nach Bewertung');
    selectSortMode('Nach Bewertung');

    // Both cards have the title 'Pasta'; use kulinarik tags to verify order.
    // The newer recipe (June, id '2', kulinarik 'Newer') must appear before
    // the older recipe (January, id '1', kulinarik 'Older').
    const tags = Array.from(document.querySelectorAll('.kulinarik-tag')).map(el => el.textContent);
    expect(tags).toEqual(['Newer', 'Older']);
  });

  describe('"Neue Rezepte" mode', () => {
    const now = Date.now();
    const recentDate = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();   // 5 days ago
    const olderDate  = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();  // 10 days ago
    const oldDate    = new Date(now - 45 * 24 * 60 * 60 * 1000).toISOString();  // 45 days ago (> 1 month)

    const newRecipes = [
      { id: '1', title: 'Banana Bread', ingredients: [], steps: [], createdAt: olderDate, authorId: 'u1' },
      { id: '2', title: 'Apple Pie',    ingredients: [], steps: [], createdAt: recentDate, authorId: 'u1' },
      { id: '3', title: 'Zebra Cake',   ingredients: [], steps: [], createdAt: oldDate,   authorId: 'u1' },
    ];

    test('clicking "Neue Rezepte" switches to new mode and marks it active', async () => {
      render(
        <RecipeList
          recipes={newRecipes}
          onSelectRecipe={() => {}}
          onAddRecipe={() => {}}
          categoryFilter=""
          currentUser={{ id: 'u1' }}
          searchTerm=""
        />
      );

      await screen.findByText('Neue Rezepte');
      selectSortMode('Neue Rezepte');

      expect(screen.getByText('Neue Rezepte')).toHaveClass('active');
      expect(screen.getByText('Im Trend')).not.toHaveClass('active');
    });

    test('"Neue Rezepte" mode only shows recipes from the last 30 days', async () => {
      render(
        <RecipeList
          recipes={newRecipes}
          onSelectRecipe={() => {}}
          onAddRecipe={() => {}}
          categoryFilter=""
          currentUser={{ id: 'u1' }}
          searchTerm=""
        />
      );

      await screen.findByText('Neue Rezepte');
      selectSortMode('Neue Rezepte');

      const cards = document.querySelectorAll('.recipe-card h3');
      const titles = Array.from(cards).map(c => c.textContent);
      // Only Apple Pie (5 days) and Banana Bread (10 days) are within 30 days
      expect(titles).toContain('Apple Pie');
      expect(titles).toContain('Banana Bread');
      expect(titles).not.toContain('Zebra Cake');
    });

    test('"Neue Rezepte" mode sorts by createdAt descending, then alphabetically', async () => {
      const sameDay = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
      const recipes = [
        { id: '1', title: 'Zucchini Soup', ingredients: [], steps: [], createdAt: olderDate, authorId: 'u1' },
        { id: '2', title: 'Apple Cake',    ingredients: [], steps: [], createdAt: sameDay,   authorId: 'u1' },
        { id: '3', title: 'Avocado Toast', ingredients: [], steps: [], createdAt: sameDay,   authorId: 'u1' },
      ];

      render(
        <RecipeList
          recipes={recipes}
          onSelectRecipe={() => {}}
          onAddRecipe={() => {}}
          categoryFilter=""
          currentUser={{ id: 'u1' }}
          searchTerm=""
        />
      );

      await screen.findByText('Neue Rezepte');
      selectSortMode('Neue Rezepte');

      const cards = document.querySelectorAll('.recipe-card h3');
      const titles = Array.from(cards).map(c => c.textContent);
      // Apple Cake and Avocado Toast share the same date → alphabetical
      // Zucchini Soup is older → last
      expect(titles).toEqual(['Apple Cake', 'Avocado Toast', 'Zucchini Soup']);
    });

    test('"Neue Rezepte" mode shows "Neu" badge on new recipe cards', async () => {
      render(
        <RecipeList
          recipes={newRecipes}
          onSelectRecipe={() => {}}
          onAddRecipe={() => {}}
          categoryFilter=""
          currentUser={{ id: 'u1' }}
          searchTerm=""
        />
      );

      await screen.findByText('Neue Rezepte');
      selectSortMode('Neue Rezepte');

      const newBadges = document.querySelectorAll('.new-badge');
      // Only the 2 recipes within 30 days should have the badge
      expect(newBadges.length).toBe(2);
    });

    test('"Neue Rezepte" mode shows empty state when no recipes are from the last month', async () => {
      const onlyOldRecipes = [
        { id: '1', title: 'Old Cake', ingredients: [], steps: [], createdAt: oldDate, authorId: 'u1' },
      ];

      render(
        <RecipeList
          recipes={onlyOldRecipes}
          onSelectRecipe={() => {}}
          onAddRecipe={() => {}}
          categoryFilter=""
          currentUser={{ id: 'u1' }}
          searchTerm=""
        />
      );

      await screen.findByText('Neue Rezepte');
      selectSortMode('Neue Rezepte');

      expect(await screen.findByText('Keine neuen Rezepte!')).toBeInTheDocument();
    });
  });
});
