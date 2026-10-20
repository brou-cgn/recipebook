import React from 'react';
import { render, screen } from '@testing-library/react';
import CookDateModal from './CookDateModal';
import { FollowProvider } from '../contexts/FollowContext';

jest.mock('../utils/followFirestore', () => ({
  subscribeMyFollows: (_uid, onChange) => { onChange({}); return () => {}; },
  requestToFollow: jest.fn(),
  stopFollowing: jest.fn(),
}));

jest.mock('../utils/imageUtils', () => ({
  isBase64Image: jest.fn(() => false),
}));

jest.mock('../utils/recipeCookDates', () => ({
  setCookDate: () => Promise.resolve(true),
  deleteCookDate: () => Promise.resolve(),
  subscribeCookDates: (_recipeId, callback) => {
    callback([]);
    return () => {};
  },
}));

describe('CookDateModal – date prefill behaviour', () => {
  const defaultProps = {
    recipeId: 'recipe-1',
    currentUser: { id: 'user-1', vorname: 'Test' },
    onClose: jest.fn(),
  };

  test('date input is empty when prefillToday is false (default)', () => {
    render(<CookDateModal {...defaultProps} />);
    const input = document.querySelector('#cook-date-input');
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('');
  });

  test('date input is empty when prefillToday is explicitly false', () => {
    render(<CookDateModal {...defaultProps} prefillToday={false} />);
    const input = document.querySelector('#cook-date-input');
    expect(input.value).toBe('');
  });

  test('date input is pre-filled with today when prefillToday is true', () => {
    const todayStr = new Date().toISOString().split('T')[0];
    render(<CookDateModal {...defaultProps} prefillToday={true} />);
    const input = document.querySelector('#cook-date-input');
    expect(input.value).toBe(todayStr);
  });
});

describe('CookDateModal – Folgen-Button auf der Erstellt-am-Kachel', () => {
  const props = {
    recipeId: 'recipe-1',
    currentUser: { id: 'me', vorname: 'Ich' },
    allUsers: [{ id: 'corinna', vorname: 'Corinna' }],
    recipeAuthorId: 'corinna',
    recipeCreatedAt: new Date('2026-10-19'),
    onClose: jest.fn(),
  };
  const renderModal = (overrides = {}) => render(
    <FollowProvider userId="me" enabled>
      <CookDateModal {...props} {...overrides} />
    </FollowProvider>,
  );

  test('zeigt den Folgen-Button für den Autor', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Corinna folgen' })).toBeInTheDocument();
  });

  test('zeigt keinen Button für den eigenen Eintrag', () => {
    renderModal({ recipeAuthorId: 'me', allUsers: [{ id: 'me', vorname: 'Ich' }] });
    expect(screen.queryByRole('button', { name: /folgen/ })).not.toBeInTheDocument();
  });
});
