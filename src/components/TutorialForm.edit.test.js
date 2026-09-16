import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TutorialForm from './TutorialForm';

jest.mock('../utils/customLists', () => ({
  getButtonIcons: () => Promise.resolve({}),
  DEFAULT_BUTTON_ICONS: {},
  getEffectiveIcon: () => '',
  getDarkModePreference: () => false
}));

// TutorialForm dient sowohl dem Anlegen als auch dem Bearbeiten: per
// Longpress auf eine Tutorialkarte kommt es mit den Daten des Tutorials und
// der Überschrift "Tutorial bearbeiten" hoch.
describe('TutorialForm edit mode', () => {
  const tutorial = {
    id: 'tut-1',
    title: 'Zwiebeln schneiden',
    videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
    category: 'sauce',
    thumbFrame: 2,
    thumbZoom: 1.5,
    thumbPosX: 0.25,
    thumbPosY: 0.75
  };

  test('shows the create heading without a tutorial', () => {
    render(<TutorialForm onSave={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByRole('heading', { name: 'Neues Tutorial hinzufügen' })).toBeInTheDocument();
    expect(screen.getByLabelText('Titel')).toHaveValue('');
  });

  test('shows the edit heading and prefills the tutorial', () => {
    render(<TutorialForm tutorial={tutorial} onSave={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByRole('heading', { name: 'Tutorial bearbeiten' })).toBeInTheDocument();
    expect(screen.getByLabelText('Titel')).toHaveValue(tutorial.title);
    expect(screen.getByLabelText('Video-URL')).toHaveValue(tutorial.videoUrl);
    expect(screen.getByRole('button', { name: 'Saucen & Fonds' })).toHaveClass('active');
    expect(screen.getByLabelText('Vorschaubild zoomen')).toHaveValue('1.5');
  });

  // Der Reset-Effekt für die Zuschnittwahl läuft auch beim Mounten - er darf
  // den gespeicherten Zuschnitt nicht überschreiben.
  test('keeps the stored crop until the video URL actually changes', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(<TutorialForm tutorial={tutorial} onSave={onSave} onCancel={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      title: tutorial.title,
      videoUrl: tutorial.videoUrl,
      category: 'sauce',
      thumbFrame: 2,
      thumbZoom: 1.5,
      thumbPosX: 0.25,
      thumbPosY: 0.75
    }));
  });

  test('resets the crop when a different video is entered', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(<TutorialForm tutorial={tutorial} onSave={onSave} onCancel={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Video-URL'), {
      target: { value: 'https://www.youtube.com/watch?v=zyxwvutsrqp' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      thumbFrame: null,
      thumbZoom: 1,
      thumbPosX: 0.5,
      thumbPosY: 0.5
    }));
  });
});
