import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import RecipeRating from './RecipeRating';
import { getUserRating } from '../utils/recipeRatings';

jest.mock('../utils/recipeRatings', () => ({
  rateRecipe: jest.fn(),
  getUserRating: jest.fn(),
  subscribeToRatingSummary: jest.fn(() => () => {}),
}));

jest.mock('../utils/customLists', () => ({
  getButtonIcons: () => Promise.resolve({}),
  DEFAULT_BUTTON_ICONS: { ratingHeartEmpty: '♡', ratingHeartFilled: '♥' },
  getEffectiveIcon: () => '',
  getDarkModePreference: () => false,
}));

// Mehrsprachigkeit PR 6a: Durchschnitt nach der Sprache formatiert, Einzahl und Mehrzahl je Sprache
describe('RecipeRating', () => {
  beforeEach(() => {
    getUserRating.mockResolvedValue(null);
  });

  test('Zusammenfassung in der Rezeptansicht auf Deutsch, eine Bewertung in der Einzahl', async () => {
    renderWithProviders(<RecipeRating recipeId="r1" ratingAvg={4.5} ratingCount={1} onOpenModal={() => {}} />);
    expect(screen.getByRole('button', { name: 'Bewertung: Ø 4,5 (1 Bewertung) – Jetzt bewerten' })).toBeInTheDocument();
    expect(screen.getByText('4,5 (1)')).toBeInTheDocument();
    await waitFor(() => expect(getUserRating).toHaveBeenCalled());
  });

  test('auf Englisch mit Punkt und Mehrzahl', async () => {
    renderWithProviders(<RecipeRating recipeId="r1" ratingAvg={4.25} ratingCount={3} onOpenModal={() => {}} />, { sprache: 'en' });
    expect(screen.getByRole('button', { name: 'Rating: Ø 4.3 (3 ratings) – rate now' })).toBeInTheDocument();
    await waitFor(() => expect(getUserRating).toHaveBeenCalled());
  });

  test('auf Karten: eigene Bewertung und Durchschnitt auf Französisch', async () => {
    getUserRating.mockResolvedValue(1);
    renderWithProviders(<RecipeRating recipeId="r1" ratingAvg={3} ratingCount={2} currentUser={{ id: 'u' }} />, { sprache: 'fr' });
    expect(await screen.findByLabelText('Ta note : 1 cœur')).toBeInTheDocument();
  });

  test('ohne Bewertungen', async () => {
    renderWithProviders(<RecipeRating recipeId="r1" ratingAvg={0} ratingCount={0} />);
    expect(screen.getByLabelText('Noch keine Bewertungen')).toBeInTheDocument();
    await waitFor(() => expect(getUserRating).toHaveBeenCalled());
  });
});
