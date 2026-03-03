import React from 'react';
import { render, screen } from '@testing-library/react';
import RecipeRating from './RecipeRating';
import { getUserRating } from '../utils/recipeRatings';

jest.mock('../utils/recipeRatings', () => ({
  rateRecipe: jest.fn(),
  getUserRating: jest.fn(),
  subscribeToRatingSummary: jest.fn(),
}));

beforeEach(() => {
  getUserRating.mockResolvedValue(null);
  const { subscribeToRatingSummary } = require('../utils/recipeRatings');
  subscribeToRatingSummary.mockReturnValue(() => {});
});

describe('RecipeRating – compact mode visible text', () => {
  it('zeigt "Noch keine Bewertungen" wenn keine Bewertungen vorhanden', () => {
    render(
      <RecipeRating
        recipeId="r1"
        ratingAvg={0}
        ratingCount={0}
        currentUser={null}
        interactive={false}
      />
    );
    expect(screen.getByText('Noch keine Bewertungen')).toBeInTheDocument();
  });

  it('zeigt Durchschnitt und Anzahl wenn fremde Bewertungen vorhanden', () => {
    render(
      <RecipeRating
        recipeId="r2"
        ratingAvg={4.8}
        ratingCount={12}
        currentUser={null}
        interactive={false}
      />
    );
    expect(screen.getByText(/Ø/)).toBeInTheDocument();
    expect(screen.getByText(/4,8/)).toBeInTheDocument();
    expect(screen.getByText(/12/)).toBeInTheDocument();
  });

  it('zeigt eigene Bewertung als sichtbaren Text', async () => {
    getUserRating.mockResolvedValueOnce(3);

    render(
      <RecipeRating
        recipeId="r3"
        ratingAvg={3}
        ratingCount={1}
        currentUser={{ id: 'u1' }}
        interactive={false}
      />
    );

    await screen.findByText(/Deine Bewertung: 3 Herzen/);
  });

  it('zeigt "Herz" (Singular) bei eigener Bewertung von 1', async () => {
    getUserRating.mockResolvedValueOnce(1);

    render(
      <RecipeRating
        recipeId="r4"
        ratingAvg={1}
        ratingCount={1}
        currentUser={{ id: 'u1' }}
        interactive={false}
      />
    );

    await screen.findByText(/Deine Bewertung: 1 Herz$/);
  });

  it('aria-label stimmt mit sichtbarem Text überein – keine Bewertungen', () => {
    const { container } = render(
      <RecipeRating
        recipeId="r5"
        ratingAvg={0}
        ratingCount={0}
        currentUser={null}
        interactive={false}
      />
    );
    const el = container.querySelector('[aria-label]');
    expect(el).toHaveAttribute('aria-label', 'Noch keine Bewertungen');
  });
});
