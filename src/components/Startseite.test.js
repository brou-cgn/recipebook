import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Startseite from './Startseite';

jest.mock('../utils/recipeCallsFirestore', () => ({
  getRecentRecipeCalls: jest.fn(),
}));

jest.mock('../utils/recipeCookDates', () => ({
  getAllCookDates: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../utils/userFavorites', () => ({
  getUserFavorites: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../utils/customLists', () => ({
  getDarkModePreference: jest.fn(() => false),
  DEFAULT_BUTTON_ICONS: {},
  DEFAULT_STARTSEITEN_KANDIDATEN_LEERTEXT: 'Keine gemeinsamen Kandidaten vorhanden.',
  getButtonIcons: jest.fn(() => Promise.resolve({})),
  getEffectiveIcon: jest.fn((icons, key) => ''),
  getGroupStatusThresholds: jest.fn(() => Promise.resolve({})),
  getMaxKandidatenSchwelle: jest.fn(() => Promise.resolve(null)),
  getStartseitenKandidatenLeertext: jest.fn(() => Promise.resolve('Keine gemeinsamen Kandidaten vorhanden.')),
}));

jest.mock('../utils/recipeSwipeFlags', () => ({
  getAllMembersSwipeFlags: jest.fn(() => Promise.resolve({})),
  computeGroupRecipeStatus: jest.fn(() => null),
}));

jest.mock('./TrendingCard', () => ({ recipe, onSelectRecipe, difficultyIcon, timeIcon }) => (
  <div data-testid="trending-card" onClick={() => onSelectRecipe?.(recipe)}>{recipe.title}</div>
));

const mockRecipes = [
  { id: 'r1', title: 'Rezept 1' },
  { id: 'r2', title: 'Rezept 2' },
  { id: 'r3', title: 'Rezept 3' },
];

beforeEach(() => {
  const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
  getRecentRecipeCalls.mockResolvedValue([]);
  const { getAllCookDates } = require('../utils/recipeCookDates');
  getAllCookDates.mockResolvedValue([]);
  const { getUserFavorites } = require('../utils/userFavorites');
  getUserFavorites.mockResolvedValue([]);
  const { getAllMembersSwipeFlags } = require('../utils/recipeSwipeFlags');
  getAllMembersSwipeFlags.mockResolvedValue({});
  const { getGroupStatusThresholds, getMaxKandidatenSchwelle, getStartseitenKandidatenLeertext } = require('../utils/customLists');
  getGroupStatusThresholds.mockResolvedValue({});
  getMaxKandidatenSchwelle.mockResolvedValue(null);
  getStartseitenKandidatenLeertext.mockResolvedValue('Keine gemeinsamen Kandidaten vorhanden.');
});

describe('Startseite', () => {
  test('renders without crashing', () => {
    const { container } = render(<Startseite currentUser={{ id: 'u1' }} />);
    expect(container.querySelector('.startseite-container')).toBeInTheDocument();
  });

  test('renders without a currentUser', () => {
    const { container } = render(<Startseite />);
    expect(container.querySelector('.startseite-container')).toBeInTheDocument();
  });

  test('shows "Im Trend" section title', () => {
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} />);
    expect(screen.getByText('Im Trend')).toBeInTheDocument();
  });

  test('shows "Meine Alltagsklassiker" section title', () => {
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} />);
    expect(screen.getByText('Meine Alltagsklassiker')).toBeInTheDocument();
  });

  test('shows loading state initially', () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockReturnValue(new Promise(() => {}));
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} />);
    expect(screen.getByText('Laden…')).toBeInTheDocument();
  });

  test('shows empty state when no trending recipes', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} />);
    expect(await screen.findByText('Keine Trendrezepte vorhanden.')).toBeInTheDocument();
  });

  test('shows top recipes in carousel sorted by call count', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([
      { id: 'c1', recipeId: 'r2' },
      { id: 'c2', recipeId: 'r2' },
      { id: 'c3', recipeId: 'r1' },
    ]);
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} />);
    expect(await screen.findAllByText('Rezept 2')).not.toHaveLength(0);
    expect(screen.getAllByText('Rezept 1').length).toBeGreaterThan(0);
  });

  test('limits trending carousel to top 10 recipes', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    const manyRecipes = Array.from({ length: 11 }, (_, i) => ({ id: `r${i}`, title: `Rezept ${i}` }));
    const calls = manyRecipes.map((r, i) => ({ id: `c${i}`, recipeId: r.id }));
    getRecentRecipeCalls.mockResolvedValue(calls);
    const { container } = render(<Startseite currentUser={{ id: 'u1' }} recipes={manyRecipes} />);
    await screen.findByText('Rezept 0');
    // Both carousels (Im Trend + Neue Rezepte) cap at 10 each → 20 items total
    const items = container.querySelectorAll('.startseite-carousel-item');
    expect(items.length).toBe(20);
  });

  test('renders "mehr" buttons for all four carousels', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} />);
    await screen.findByText('Keine Trendrezepte vorhanden.');
    await screen.findByText('Keine gemeinsamen Kandidaten vorhanden.');
    const mehrButtons = screen.getAllByRole('button', { name: /mehr/i });
    expect(mehrButtons.length).toBe(4);
  });

  test('shows "Meine Alltagsklassiker" directly below "Meine Kochideen"', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    const { container } = render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} />);
    await screen.findByText('Keine gemeinsamen Kandidaten vorhanden.');
    const sectionTitles = Array.from(container.querySelectorAll('.startseite-section-title')).map((title) => title.textContent);
    expect(sectionTitles.indexOf('Meine Alltagsklassiker')).toBe(sectionTitles.indexOf('Meine Kochideen') + 1);
  });

  test('"mehr" button of "Im Trend" calls onViewChange with trendingRecipes', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    const onViewChange = jest.fn();
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} onViewChange={onViewChange} />);
    await screen.findByText('Keine Trendrezepte vorhanden.');
    const mehrButtons = screen.getAllByRole('button', { name: /mehr/i });
    fireEvent.click(mehrButtons[2]);
    expect(onViewChange).toHaveBeenCalledWith('trendingRecipes');
  });

  test('"mehr" button of "Im Trend" sets sessionStorage sort to trending', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    const onViewChange = jest.fn();
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} onViewChange={onViewChange} />);
    await screen.findByText('Keine Trendrezepte vorhanden.');
    const mehrButtons = screen.getAllByRole('button', { name: /mehr/i });
    fireEvent.click(mehrButtons[2]);
    expect(sessionStorage.getItem('recipebook_active_sort')).toBe('trending');
  });

  test('clicking a trending card calls onSelectRecipe with the recipe', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([
      { id: 'c1', recipeId: 'r1' },
    ]);
    const onSelectRecipe = jest.fn();
    render(
      <Startseite
        currentUser={{ id: 'u1' }}
        recipes={mockRecipes}
        onSelectRecipe={onSelectRecipe}
      />
    );
    const card = await screen.findByText('Rezept 1');
    fireEvent.click(card);
    expect(onSelectRecipe).toHaveBeenCalledWith(mockRecipes[0]);
  });

  // ─── Neue Rezepte carousel ─────────────────────────────────────────────────

  test('shows "Neue Rezepte" section title', () => {
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} />);
    expect(screen.getByText('Neue Rezepte')).toBeInTheDocument();
  });

  test('shows empty state for Neue Rezepte when no recipes provided', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    render(<Startseite currentUser={{ id: 'u1' }} recipes={[]} />);
    expect(await screen.findByText('Keine Rezepte vorhanden.')).toBeInTheDocument();
  });

  test('shows up to 10 newest recipes in Neue Rezepte carousel', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    const now = Date.now();
    const manyRecipes = Array.from({ length: 11 }, (_, i) => ({
      id: `r${i}`,
      title: `Rezept ${i}`,
      createdAt: new Date(now - i * 1000).toISOString(),
    }));
    const { container } = render(<Startseite currentUser={{ id: 'u1' }} recipes={manyRecipes} />);
    await screen.findByText('Keine Trendrezepte vorhanden.');
    // Only one carousel (Neue Rezepte) has items; it should show 10
    const items = container.querySelectorAll('.startseite-carousel-item');
    expect(items.length).toBe(10);
  });

  test('Neue Rezepte carousel sorts recipes by createdAt descending', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    const now = Date.now();
    const recipes = [
      { id: 'old', title: 'Altes Rezept', createdAt: new Date(now - 10000).toISOString() },
      { id: 'new', title: 'Neues Rezept', createdAt: new Date(now).toISOString() },
    ];
    render(<Startseite currentUser={{ id: 'u1' }} recipes={recipes} />);
    await screen.findByText('Keine Trendrezepte vorhanden.');
    const cards = screen.getAllByTestId('trending-card');
    // The first card in the "Neue Rezepte" section should be the newest recipe
    expect(cards[0].textContent).toBe('Neues Rezept');
  });

  test('Neue Rezepte carousel uses publishedAt over createdAt when present', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    const now = Date.now();
    const recipes = [
      {
        id: 'old-created-recent-published',
        title: 'Neues Rezept',
        createdAt: new Date(now - 20000).toISOString(),
        publishedAt: new Date(now).toISOString(),
      },
      {
        id: 'recent-created-no-published',
        title: 'Altes Rezept',
        createdAt: new Date(now - 10000).toISOString(),
      },
    ];
    render(<Startseite currentUser={{ id: 'u1' }} recipes={recipes} />);
    await screen.findByText('Keine Trendrezepte vorhanden.');
    const cards = screen.getAllByTestId('trending-card');
    // Recipe with more recent publishedAt should appear first
    expect(cards[0].textContent).toBe('Neues Rezept');
  });

  test('Neue Rezepte carousel falls back to createdAt when publishedAt absent', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    const now = Date.now();
    const recipes = [
      { id: 'r1', title: 'Altes Rezept', createdAt: new Date(now - 10000).toISOString() },
      { id: 'r2', title: 'Neues Rezept', createdAt: new Date(now).toISOString() },
    ];
    render(<Startseite currentUser={{ id: 'u1' }} recipes={recipes} />);
    await screen.findByText('Keine Trendrezepte vorhanden.');
    const cards = screen.getAllByTestId('trending-card');
    expect(cards[0].textContent).toBe('Neues Rezept');
  });

  test('"mehr" button of "Neue Rezepte" calls onViewChange with neueRezepte', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    const onViewChange = jest.fn();
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} onViewChange={onViewChange} />);
    await screen.findByText('Keine Trendrezepte vorhanden.');
    const mehrButtons = screen.getAllByRole('button', { name: /mehr/i });
    fireEvent.click(mehrButtons[3]);
    expect(onViewChange).toHaveBeenCalledWith('neueRezepte');
  });

  test('"mehr" button of "Neue Rezepte" sets sessionStorage sort to newest', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    const onViewChange = jest.fn();
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} onViewChange={onViewChange} />);
    await screen.findByText('Keine Trendrezepte vorhanden.');
    const mehrButtons = screen.getAllByRole('button', { name: /mehr/i });
    fireEvent.click(mehrButtons[3]);
    expect(sessionStorage.getItem('recipebook_active_sort')).toBe('newest');
  });

  // ─── Meine Kochideen carousel ──────────────────────────────────────

  test('shows "Meine Kochideen" section title', async () => {
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} />);
    expect(screen.getByText('Meine Kochideen')).toBeInTheDocument();
  });

  test('shows configurable empty text when no candidates available', async () => {
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} />);
    expect(await screen.findByText('Keine gemeinsamen Kandidaten vorhanden.')).toBeInTheDocument();
  });

  test('uses custom empty text from settings', async () => {
    const { getStartseitenKandidatenLeertext } = require('../utils/customLists');
    getStartseitenKandidatenLeertext.mockResolvedValue('Noch keine Kandidaten da.');
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} />);
    expect(await screen.findByText('Noch keine Kandidaten da.')).toBeInTheDocument();
  });

  test('"mehr" button of "Meine Kochideen" calls onViewChange with tagesmenu', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    const onViewChange = jest.fn();
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} onViewChange={onViewChange} />);
    await screen.findByText('Keine gemeinsamen Kandidaten vorhanden.');
    const mehrButtons = screen.getAllByRole('button', { name: /mehr/i });
    fireEvent.click(mehrButtons[0]);
    expect(onViewChange).toHaveBeenCalledWith('tagesmenu');
  });

  test('shows empty state when no defaultWebImportList is set', async () => {
    render(<Startseite currentUser={{ id: 'u1' }} recipes={mockRecipes} groups={[]} />);
    expect(await screen.findByText('Keine gemeinsamen Kandidaten vorhanden.')).toBeInTheDocument();
  });

  test('shows candidates from default web import list sorted alphabetically', async () => {
    const { getMaxKandidatenSchwelle, getGroupStatusThresholds } = require('../utils/customLists');
    const { getAllMembersSwipeFlags, computeGroupRecipeStatus } = require('../utils/recipeSwipeFlags');
    getMaxKandidatenSchwelle.mockResolvedValue(5);
    getGroupStatusThresholds.mockResolvedValue({});
    getAllMembersSwipeFlags.mockResolvedValue({
      'u1': { 'r1': 'kandidat', 'r2': 'kandidat', 'r3': 'kandidat' },
      'u2': { 'r1': 'kandidat', 'r2': 'kandidat', 'r3': 'kandidat' },
    });
    computeGroupRecipeStatus.mockReturnValue('kandidat');

    const group = { id: 'g1', type: 'private', ownerId: 'u1', memberIds: ['u2'], recipeIds: ['r1', 'r2', 'r3'] };
    const user = { id: 'u1', defaultWebImportListId: 'g1' };
    const recipes = [
      { id: 'r1', title: 'Zitronenhuhn', groupId: 'g1' },
      { id: 'r2', title: 'Apfelkuchen', groupId: 'g1' },
      { id: 'r3', title: 'Möhrensuppe', groupId: 'g1' },
    ];

    const { container } = render(<Startseite currentUser={user} recipes={recipes} groups={[group]} />);

    // Wait for the candidates carousel to finish loading
    await screen.findByText('Apfelkuchen');

    // Find the "Meine Kochideen" section and check the order of items
    const sections = container.querySelectorAll('.startseite-trending-section');
    const kandidatenSection = Array.from(sections).find(
      (s) => s.querySelector('.startseite-section-title')?.textContent === 'Meine Kochideen'
    );
    expect(kandidatenSection).toBeTruthy();
    const kandidatenCards = kandidatenSection.querySelectorAll('[data-testid="trending-card"]');
    const titles = Array.from(kandidatenCards).map((c) => c.textContent);
    expect(titles).toEqual(['Apfelkuchen', 'Möhrensuppe', 'Zitronenhuhn']);
  });

  test('does not show candidates when maxKandidatenSchwelle is null', async () => {
    const { getMaxKandidatenSchwelle } = require('../utils/customLists');
    const { computeGroupRecipeStatus } = require('../utils/recipeSwipeFlags');
    getMaxKandidatenSchwelle.mockResolvedValue(null);
    computeGroupRecipeStatus.mockReturnValue('kandidat');

    const group = { id: 'g1', type: 'private', ownerId: 'u1', memberIds: ['u2'], recipeIds: ['r1'] };
    const user = { id: 'u1', defaultWebImportListId: 'g1' };
    const recipes = [{ id: 'r1', title: 'Rezept A', groupId: 'g1' }];

    const { container } = render(<Startseite currentUser={user} recipes={recipes} groups={[group]} />);

    await screen.findByText('Keine gemeinsamen Kandidaten vorhanden.');

    // The candidates carousel section should show the empty text, not a card
    const sections = container.querySelectorAll('.startseite-trending-section');
    const kandidatenSection = Array.from(sections).find(
      (s) => s.querySelector('.startseite-section-title')?.textContent === 'Meine Kochideen'
    );
    expect(kandidatenSection).toBeTruthy();
    expect(kandidatenSection.querySelectorAll('[data-testid="trending-card"]')).toHaveLength(0);
  });

  // ─── Inspirationssammlung setup button ─────────────────────────────────────

  test('shows setup button when no defaultWebImportList and onCreateInspirationList is provided', async () => {
    const onCreateInspirationList = jest.fn();
    render(
      <Startseite
        currentUser={{ id: 'u1' }}
        groups={[]}
        onCreateInspirationList={onCreateInspirationList}
      />
    );
    expect(await screen.findByRole('button', { name: /Inspirationssammlung anlegen/i })).toBeInTheDocument();
    expect(screen.queryByText('Keine gemeinsamen Kandidaten vorhanden.')).not.toBeInTheDocument();
  });

  test('shows setup button when default list is a classic collection', async () => {
    const onCreateInspirationList = jest.fn();
    const classicGroup = { id: 'g1', type: 'private', ownerId: 'u1', memberIds: ['u1'], listKind: 'classic' };
    render(
      <Startseite
        currentUser={{ id: 'u1', defaultWebImportListId: 'g1' }}
        groups={[classicGroup]}
        onCreateInspirationList={onCreateInspirationList}
      />
    );
    expect(await screen.findByRole('button', { name: /Inspirationssammlung anlegen/i })).toBeInTheDocument();
    expect(screen.queryByText('Keine gemeinsamen Kandidaten vorhanden.')).not.toBeInTheDocument();
  });

  test('does not show setup button when default list is interactive', async () => {
    const onCreateInspirationList = jest.fn();
    const interactiveGroup = { id: 'g1', type: 'private', ownerId: 'u1', memberIds: ['u1'], listKind: 'interactive' };
    render(
      <Startseite
        currentUser={{ id: 'u1', defaultWebImportListId: 'g1' }}
        groups={[interactiveGroup]}
        onCreateInspirationList={onCreateInspirationList}
      />
    );
    await screen.findByText('Keine gemeinsamen Kandidaten vorhanden.');
    expect(screen.queryByRole('button', { name: /Inspirationssammlung anlegen/i })).not.toBeInTheDocument();
  });

  test('does not show setup button when onCreateInspirationList is not provided', async () => {
    render(
      <Startseite
        currentUser={{ id: 'u1' }}
        groups={[]}
      />
    );
    await screen.findByText('Keine gemeinsamen Kandidaten vorhanden.');
    expect(screen.queryByRole('button', { name: /Inspirationssammlung anlegen/i })).not.toBeInTheDocument();
  });

  test('calls onCreateInspirationList when setup button is clicked', async () => {
    const onCreateInspirationList = jest.fn(() => Promise.resolve());
    render(
      <Startseite
        currentUser={{ id: 'u1' }}
        groups={[]}
        onCreateInspirationList={onCreateInspirationList}
      />
    );
    const btn = await screen.findByRole('button', { name: /Inspirationssammlung anlegen/i });
    fireEvent.click(btn);
    expect(onCreateInspirationList).toHaveBeenCalledTimes(1);
  });

  test('shows "Alltagsklassiker zuordnen" button when no list is configured', async () => {
    render(<Startseite currentUser={{ id: 'u1' }} groups={[]} />);
    expect(await screen.findByRole('button', { name: /Alltagsklassiker zuordnen/i })).toBeInTheDocument();
  });

  test('opens picker and assigns alltagsklassiker list', async () => {
    const onAssignEverydayClassicsList = jest.fn(() => Promise.resolve(true));
    const privateGroup = { id: 'g1', name: 'Liste A', type: 'private', ownerId: 'u1', memberIds: ['u1'], recipeIds: [] };
    render(
      <Startseite
        currentUser={{ id: 'u1' }}
        groups={[privateGroup]}
        onAssignEverydayClassicsList={onAssignEverydayClassicsList}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: /Alltagsklassiker zuordnen/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Liste A' }));

    await waitFor(() => {
      expect(onAssignEverydayClassicsList).toHaveBeenCalledWith('g1');
    });
  });

  test('sorts alltagsklassiker with favorites first and then by last own cook date ascending', async () => {
    const { getAllCookDates } = require('../utils/recipeCookDates');
    const { getUserFavorites } = require('../utils/userFavorites');
    const alltagsRecipes = Array.from({ length: 11 }, (_, idx) => ({
      id: `r${idx + 1}`,
      title: `Rezept ${String(idx + 1).padStart(2, '0')}`,
      groupId: 'g-classics',
    }));
    getUserFavorites.mockResolvedValue(['r3', 'r1', 'r7']);
    getAllCookDates.mockImplementation((recipeId) => {
      const number = Number(recipeId.replace('r', ''));
      return Promise.resolve([{ id: `cd-${recipeId}`, userId: 'u1', recipeId, date: new Date(`2026-01-${String(number).padStart(2, '0')}T00:00:00.000Z`) }]);
    });

    const { container } = render(
      <Startseite
        currentUser={{ id: 'u1', defaultEverydayClassicsListId: 'g-classics' }}
        groups={[{ id: 'g-classics', type: 'private', ownerId: 'u1', memberIds: ['u1'], recipeIds: alltagsRecipes.map(r => r.id) }]}
        recipes={alltagsRecipes}
      />
    );

    expect(await screen.findAllByText('Rezept 10')).not.toHaveLength(0);
    const sections = container.querySelectorAll('.startseite-trending-section');
    const alltagsSection = Array.from(sections).find(
      (s) => s.querySelector('.startseite-section-title')?.textContent === 'Meine Alltagsklassiker'
    );
    expect(alltagsSection).toBeTruthy();
    const cards = alltagsSection.querySelectorAll('[data-testid="trending-card"]');
    expect(cards).toHaveLength(10);
    const titles = Array.from(cards).map((card) => card.textContent);
    expect(titles).toEqual([
      'Rezept 01',
      'Rezept 03',
      'Rezept 07',
      'Rezept 02',
      'Rezept 04',
      'Rezept 05',
      'Rezept 06',
      'Rezept 08',
      'Rezept 09',
      'Rezept 10',
    ]);
  });

  test('"mehr" button of "Meine Alltagsklassiker" opens filtered recipe overview', async () => {
    const onOpenPrivateListRecipes = jest.fn();
    const alltagsGroup = { id: 'g-classics', type: 'private', ownerId: 'u1', memberIds: ['u1'], recipeIds: [] };
    render(
      <Startseite
        currentUser={{ id: 'u1', defaultEverydayClassicsListId: 'g-classics' }}
        groups={[alltagsGroup]}
        onOpenPrivateListRecipes={onOpenPrivateListRecipes}
      />
    );

    await screen.findByText('Meine Alltagsklassiker');
    const mehrButtons = screen.getAllByRole('button', { name: /mehr/i });
    fireEvent.click(mehrButtons[1]);
    expect(onOpenPrivateListRecipes).toHaveBeenCalledWith('g-classics');
  });
});
