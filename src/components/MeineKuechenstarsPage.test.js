import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import MeineKuechenstarsPage from './MeineKuechenstarsPage';
import { renderWithProviders } from '../test-utils';

jest.mock('../utils/recipeCallsFirestore', () => ({
  getRecentRecipeCalls: jest.fn(),
}));

jest.mock('../utils/customLists', () => ({
  getButtonIcons: () => Promise.resolve({}),
  DEFAULT_BUTTON_ICONS: { closeButtonDefaultImg: '✕' },
  getEffectiveIcon: (icons, key) => icons[key] ?? '',
  getDarkModePreference: () => false,
}));

jest.mock('../utils/imageUtils', () => ({
  isBase64Image: jest.fn().mockReturnValue(false),
}));

const mockCurrentUser = { id: 'user-1' };
const mockRecipes = [
  { id: 'r1', title: 'Pasta Bolognese', authorId: 'user-1' },
  { id: 'r2', title: 'Pizza Margherita', authorId: 'user-1' },
  { id: 'r3', title: 'Tiramisu', authorId: 'user-1' },
  { id: 'r4', title: 'Other User Recipe', authorId: 'user-2' },
];

describe('MeineKuechenstarsPage', () => {
  beforeEach(() => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
  });

  test('renders the header with title', () => {
    render(
      <MeineKuechenstarsPage
        onBack={() => {}}
        currentUser={mockCurrentUser}
        recipes={[]}
      />
    );
    expect(screen.getByText('Meine Küchenstars')).toBeInTheDocument();
  });

  test('zeigt den Zurück-Link „Chefkoch & mehr“', () => {
    render(
      <MeineKuechenstarsPage
        onBack={() => {}}
        currentUser={mockCurrentUser}
        recipes={[]}
      />
    );
    expect(screen.getByRole('button', { name: 'Chefkoch & mehr' })).toBeInTheDocument();
  });

  test('Zurück-Link ruft onBack', () => {
    const handleBack = jest.fn();
    render(
      <MeineKuechenstarsPage
        onBack={handleBack}
        currentUser={mockCurrentUser}
        recipes={[]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Chefkoch & mehr' }));
    expect(handleBack).toHaveBeenCalled();
  });

  test('shows loading state initially', () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockImplementation(() => new Promise(() => {}));
    render(
      <MeineKuechenstarsPage
        onBack={() => {}}
        currentUser={mockCurrentUser}
        recipes={mockRecipes}
      />
    );
    expect(screen.getByText('Wird geladen …')).toBeInTheDocument();
  });

  test('shows empty message when no recipe calls exist', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    render(
      <MeineKuechenstarsPage
        onBack={() => {}}
        currentUser={mockCurrentUser}
        recipes={mockRecipes}
      />
    );
    expect(await screen.findByText('Noch keine Rezeptaufrufe vorhanden.')).toBeInTheDocument();
  });

  test('shows top recipes sorted by call count', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([
      { id: 'c1', recipeId: 'r2' },
      { id: 'c2', recipeId: 'r2' },
      { id: 'c3', recipeId: 'r2' },
      { id: 'c4', recipeId: 'r1' },
      { id: 'c5', recipeId: 'r1' },
    ]);
    render(
      <MeineKuechenstarsPage
        onBack={() => {}}
        currentUser={mockCurrentUser}
        recipes={mockRecipes}
      />
    );
    // Variante A: Platz 1 bis 3 als Podium (nummerierte Liste), danach die Liste ab Platz 4
    const plaetze = await screen.findAllByRole('listitem');
    expect(plaetze[0]).toHaveTextContent('Pizza Margherita');
    expect(plaetze[0]).toHaveTextContent('3');
    expect(plaetze[1]).toHaveTextContent('Pasta Bolognese');
    expect(plaetze[1]).toHaveTextContent('2');
  });

  test('only shows own recipes, not other users recipes', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([
      { id: 'c1', recipeId: 'r4' },
      { id: 'c2', recipeId: 'r4' },
    ]);
    render(
      <MeineKuechenstarsPage
        onBack={() => {}}
        currentUser={mockCurrentUser}
        recipes={mockRecipes}
      />
    );
    // r4 belongs to user-2, so it shouldn't appear
    await waitFor(() => {
      expect(screen.queryByText('Other User Recipe')).not.toBeInTheDocument();
    });
  });

  test('limits results to top 20 recipes', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    const manyRecipes = Array.from({ length: 25 }, (_, i) => ({
      id: `recipe-${i}`,
      title: `Recipe ${i}`,
      authorId: 'user-1',
    }));
    const calls = manyRecipes.map((r, i) =>
      Array.from({ length: 25 - i }, (_, j) => ({ id: `c${i}-${j}`, recipeId: r.id }))
    ).flat();
    getRecentRecipeCalls.mockResolvedValue(calls);
    render(
      <MeineKuechenstarsPage
        onBack={() => {}}
        currentUser={mockCurrentUser}
        recipes={manyRecipes}
      />
    );
    const plaetze = await screen.findAllByRole('listitem');
    // höchstens 20 Plätze: 3 auf dem Podium, 17 in der Liste ab Platz 4
    expect(plaetze.length).toBe(20);
    expect(plaetze[3].closest('ol')).toHaveAttribute('start', '4');
  });

  test('fetches only recipe calls from the last 14 days', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    render(
      <MeineKuechenstarsPage
        onBack={() => {}}
        currentUser={mockCurrentUser}
        recipes={mockRecipes}
      />
    );
    await waitFor(() => {
      expect(getRecentRecipeCalls).toHaveBeenCalledWith(14);
    });
  });

  test('shows info text mentioning 14 days', async () => {
    render(
      <MeineKuechenstarsPage
        onBack={() => {}}
        currentUser={mockCurrentUser}
        recipes={[]}
      />
    );
    expect(screen.getByText(/14 Tage/)).toBeInTheDocument();
  });
});

describe('MeineKuechenstarsPage: Mehrsprachigkeit (PR 6o)', () => {
  const rezepte = [
    {
      id: 'r1',
      title: 'Pfannkuchen',
      authorId: 'user-1',
      titelUebersetzung: { quelle: 'Pfannkuchen', originalSprache: 'de', en: 'Pancakes', fr: 'Crêpes' },
    },
    { id: 'r2', title: 'Tiramisu', authorId: 'user-1' },
  ];

  beforeEach(() => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([{ recipeId: 'r1' }, { recipeId: 'r1' }, { recipeId: 'r2' }]);
  });

  test('Englisch: Texte, Kennzahlen in Einzahl und Mehrzahl, übersetzter Titel', async () => {
    renderWithProviders(
      <MeineKuechenstarsPage onBack={() => {}} currentUser={mockCurrentUser} recipes={rezepte} />,
      { sprache: 'en', inhalteUebersetzen: true },
    );
    expect(screen.getByRole('heading', { name: 'My kitchen stars' })).toBeInTheDocument();
    expect(screen.getByText('Here are your top 20 recipes by number of views over the last 14 days.')).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(await screen.findByText('Pancakes')).toBeInTheDocument();
    expect(screen.getByText('views')).toBeInTheDocument();
    expect(screen.getByText('recipes')).toBeInTheDocument();
  });

  test('Französisch: leere Seite', async () => {
    const { getRecentRecipeCalls } = require('../utils/recipeCallsFirestore');
    getRecentRecipeCalls.mockResolvedValue([]);
    renderWithProviders(
      <MeineKuechenstarsPage onBack={() => {}} currentUser={mockCurrentUser} recipes={rezepte} />,
      { sprache: 'fr' },
    );
    expect(await screen.findByText('Aucune consultation de recette pour l’instant.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mes stars en cuisine' })).toBeInTheDocument();
  });
});
