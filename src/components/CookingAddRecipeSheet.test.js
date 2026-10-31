import React from 'react';
import { render, screen, within } from '@testing-library/react';
import CookingAddRecipeSheet from './CookingAddRecipeSheet';
import { getRecentlyCookedRecipeIds } from '../utils/recipeCookDates';

jest.mock('../utils/recipeCookDates', () => ({
  getRecentlyCookedRecipeIds: jest.fn(),
}));

const recipe = (id, title) => ({ id, title });
const rouladen = recipe('rouladen', 'Rinderrouladen');
const kloesse = recipe('kloesse', 'Kartoffelklöße');
const bratapfel = recipe('bratapfel', 'Bratapfel');
const spaetzle = recipe('spaetzle', 'Spätzle');
const allRecipes = [rouladen, kloesse, bratapfel, spaetzle];

function renderSheet(props = {}) {
  return render(
    <CookingAddRecipeSheet
      currentRecipe={rouladen}
      allRecipes={allRecipes}
      onSelect={() => {}}
      onClose={() => {}}
      {...props}
    />
  );
}

function rowLabels(section) {
  return within(section).getAllByRole('button').map((button) => button.getAttribute('aria-label'));
}

describe('CookingAddRecipeSheet – Zuletzt gekocht', () => {
  test('lists what the user cooked last, without the current recipe, running ones and other suggestions', async () => {
    getRecentlyCookedRecipeIds.mockResolvedValue(['rouladen', 'kloesse', 'bratapfel', 'spaetzle', 'unbekannt']);
    renderSheet({
      userId: 'user-1',
      excludedIds: ['kloesse'],
      menu: { name: 'Sonntagsessen', sections: [{ name: 'Dessert', recipeIds: ['bratapfel'] }] },
    });

    const section = await screen.findByRole('region', { name: 'Zuletzt gekocht' });
    expect(rowLabels(section)).toEqual(['Spätzle dazunehmen']);
    expect(getRecentlyCookedRecipeIds).toHaveBeenCalledWith('user-1');
  });

  test('shows at most five recently cooked recipes, newest first', async () => {
    const cooked = Array.from({ length: 7 }, (_, i) => recipe(`r${i}`, `Rezept ${i}`));
    getRecentlyCookedRecipeIds.mockResolvedValue(cooked.map((r) => r.id));
    renderSheet({ userId: 'user-1', allRecipes: [rouladen, ...cooked] });

    const section = await screen.findByRole('region', { name: 'Zuletzt gekocht' });
    expect(rowLabels(section)).toEqual([0, 1, 2, 3, 4].map((i) => `Rezept ${i} dazunehmen`));
  });

  test('without a user there is no query and no section', () => {
    renderSheet();

    expect(getRecentlyCookedRecipeIds).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Zuletzt gekocht' })).toBeNull();
    expect(screen.getByText('Such nach dem Rezept, das du dazunehmen willst.')).toBeInTheDocument();
  });
});
