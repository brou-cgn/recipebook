import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NutritionReferenceTab from './NutritionReferenceTab';

jest.mock('../firebase', () => ({
  db: {},
}));

const mockGetDocs = jest.fn();
const mockSetDoc = jest.fn(() => Promise.resolve());
const mockDeleteDoc = jest.fn(() => Promise.resolve());

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => 'collection-ref'),
  getDocs: (...args) => mockGetDocs(...args),
  doc: jest.fn((db, coll, id) => `${coll}/${id}`),
  setDoc: (...args) => mockSetDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  serverTimestamp: jest.fn(() => 'server-ts'),
}));

describe('NutritionReferenceTab', () => {
  beforeEach(() => {
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'tomate',
          data: () => ({ name: 'Tomate', kalorien: 18, kohlenhydrate: 3.9 }),
        },
      ],
    });
    mockSetDoc.mockClear();
    mockDeleteDoc.mockClear();
  });

  test('shows info message for unauthorized users', () => {
    render(<NutritionReferenceTab currentUser={{ role: 'read' }} />);
    expect(screen.getByText(/Nur Admins und Moderatoren/i)).toBeInTheDocument();
  });

  test('loads rows and allows adding a nutrition reference', async () => {
    render(<NutritionReferenceTab currentUser={{ id: 'u1', role: 'moderator' }} />);

    expect(await screen.findByDisplayValue('Tomate')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Neue Zutat...'), { target: { value: 'Haferflocken' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
  });
});
