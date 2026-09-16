import React from 'react';
import { render, screen } from '@testing-library/react';
import TutorialForm from './TutorialForm';

jest.mock('../utils/customLists', () => ({
  getButtonIcons: () => Promise.resolve({}),
  DEFAULT_BUTTON_ICONS: {},
  getEffectiveIcon: () => '',
  getDarkModePreference: () => false
}));

// Die mobilen FABs sollen exakt wie in der RecipeForm formatiert sein.
// Sie trugen zusätzlich `recipe-form-mobile-only`; diese Klasse setzt unter
// 768 px `display: block` und überschrieb damit das `display: flex` der
// FAB-Klassen (gleiche Spezifität, spätere Regel in RecipeForm.css) —
// dadurch verlor das Icon seine Zentrierung. Das Ausblenden auf Desktop
// erledigt ohnehin die Media-Query auf `.cancel-fab-button`/`.save-fab-button`.
describe('TutorialForm FAB formatting', () => {
  test('FABs carry the same classes as in RecipeForm', () => {
    render(<TutorialForm onSave={jest.fn()} onCancel={jest.fn()} />);

    const cancelFab = screen.getByRole('button', { name: 'Tutorial-Erstellung abbrechen' });
    const saveFab = screen.getByRole('button', { name: 'Tutorial speichern' });

    expect(cancelFab).toHaveClass('cancel-fab-button');
    expect(saveFab).toHaveClass('save-fab-button');
    expect(cancelFab).not.toHaveClass('recipe-form-mobile-only');
    expect(saveFab).not.toHaveClass('recipe-form-mobile-only');
  });
});
