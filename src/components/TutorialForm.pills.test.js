import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TutorialForm from './TutorialForm';

jest.mock('../utils/customLists', () => ({
  getButtonIcons: () => Promise.resolve({}),
  DEFAULT_BUTTON_ICONS: {},
  getEffectiveIcon: () => '',
  getDarkModePreference: () => false
}));

// Zutaten und Speisekategorien haengen als Mehrfachauswahl am Tutorial:
// beides kommt als Prop herein (nutritionReferences bzw. die gepflegten
// Speisekategorien aus den Einstellungen) und geht als Array wieder raus.
const nutritionReferenceRows = [
  { id: 'zwiebel', ingredientID: 'zwiebel', name: 'Zwiebel', synonyms: ['Küchenzwiebel'] },
  { id: 'lauch', ingredientID: 'lauch', name: 'Lauch', synonyms: ['Porree'] },
  { id: 'butter', ingredientID: 'butter', name: 'Butter', synonyms: [] }
];

const mealCategories = ['Vorspeisen', 'Hauptspeisen', 'Desserts'];

const renderForm = (props = {}) => render(
  <TutorialForm
    onSave={jest.fn()}
    onCancel={jest.fn()}
    nutritionReferenceRows={nutritionReferenceRows}
    mealCategories={mealCategories}
    {...props}
  />
);

describe('TutorialForm Mehrfachauswahlen', () => {
  test('rendert je eine Pille pro Zutat und Speisekategorie', () => {
    renderForm();

    expect(screen.getByRole('button', { name: 'Zwiebel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lauch' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hauptspeisen' })).toBeInTheDocument();
  });

  test('speichert mehrere Zutaten und Speisekategorien als Arrays', async () => {
    const onSave = jest.fn().mockResolvedValue();
    renderForm({ onSave });

    fireEvent.change(screen.getByLabelText('Titel'), { target: { value: 'Zwiebeln schneiden' } });
    fireEvent.change(screen.getByLabelText('Video-URL'), { target: { value: 'https://example.com/v' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zwiebel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lauch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vorspeisen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Desserts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      ingredientIDs: ['zwiebel', 'lauch'],
      speisekategorie: ['Vorspeisen', 'Desserts']
    });
  });

  test('ein zweiter Klick hebt die Auswahl wieder auf', async () => {
    const onSave = jest.fn().mockResolvedValue();
    renderForm({ onSave });

    fireEvent.change(screen.getByLabelText('Titel'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText('Video-URL'), { target: { value: 'https://example.com/v' } });
    fireEvent.click(screen.getByRole('button', { name: 'Butter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Butter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].ingredientIDs).toEqual([]);
  });

  test('das Suchfeld filtert die Zutatenpillen, auch ueber Synonyme', () => {
    renderForm();

    fireEvent.change(screen.getByLabelText('Zutaten (Mehrfachauswahl möglich)'), { target: { value: 'porree' } });

    expect(screen.getByRole('button', { name: 'Lauch' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zwiebel' })).not.toBeInTheDocument();
  });

  // Auswahlverfahren des Suchdialogs: zwei Reihen mit fester Zugehoerigkeit,
  // darin die gewaehlten Pillen vorn.
  test('rendert beide Pillenfelder als zweireihiges Karussell', () => {
    const { container } = renderForm();

    const carousels = container.querySelectorAll('.tutorial-pill-carousel');
    expect(carousels).toHaveLength(2);
    carousels.forEach((carousel) => {
      expect(carousel.querySelectorAll('.tutorial-pill-carousel-row')).toHaveLength(2);
    });
  });

  test('sortiert gewaehlte Pillen innerhalb ihrer Reihe nach vorn', () => {
    const { container } = renderForm();

    // Speisekategorien: ['Vorspeisen', 'Hauptspeisen'] | ['Desserts']
    fireEvent.click(screen.getByRole('button', { name: 'Hauptspeisen' }));

    const categoryCarousel = container.querySelectorAll('.tutorial-pill-carousel')[1];
    const firstRow = categoryCarousel.querySelectorAll('.tutorial-pill-carousel-row')[0];
    const labels = Array.from(firstRow.querySelectorAll('button')).map((b) => b.textContent);

    expect(labels).toEqual(['Hauptspeisen', 'Vorspeisen']);
  });

  test('eine Pille wechselt beim Auswaehlen nicht die Reihe', () => {
    const { container } = renderForm();

    const rowOf = (name) => {
      const rows = Array.from(container.querySelectorAll('.tutorial-pill-carousel-row'));
      return rows.findIndex((row) => (
        Array.from(row.querySelectorAll('button')).some((b) => b.textContent === name)
      ));
    };

    const before = rowOf('Desserts');
    fireEvent.click(screen.getByRole('button', { name: 'Desserts' }));
    expect(rowOf('Desserts')).toBe(before);
  });

  test('gewaehlte Zutaten bleiben sichtbar, wenn die Suche sie nicht mehr trifft', () => {
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Zwiebel' }));
    fireEvent.change(screen.getByLabelText('Zutaten (Mehrfachauswahl möglich)'), { target: { value: 'butter' } });

    const zwiebelPill = screen.getByRole('button', { name: 'Zwiebel' });
    expect(zwiebelPill).toHaveClass('active');
    expect(zwiebelPill).toHaveAttribute('aria-pressed', 'true');
  });

  test('uebernimmt bestehende Auswahl beim Bearbeiten', () => {
    renderForm({
      tutorial: {
        id: 'tut-1',
        title: 'Zwiebeln schneiden',
        videoUrl: 'https://example.com/v',
        category: 'schneiden',
        ingredientIDs: ['zwiebel'],
        speisekategorie: ['Hauptspeisen']
      }
    });

    expect(screen.getByRole('button', { name: 'Zwiebel' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: 'Hauptspeisen' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: 'Desserts' })).not.toHaveClass('active');
  });

  test('kommt ohne die beiden Listen und ohne Altfelder aus', () => {
    render(<TutorialForm onSave={jest.fn()} onCancel={jest.fn()} tutorial={{ id: 'x', title: 'A', videoUrl: 'https://example.com/v', category: 'garen' }} />);

    expect(screen.getByText('Keine Zutaten verfügbar.')).toBeInTheDocument();
    expect(screen.getByText('Keine Speisekategorien verfügbar.')).toBeInTheDocument();
  });
});
