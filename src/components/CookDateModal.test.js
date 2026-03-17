import React from 'react';
import { render } from '@testing-library/react';
import CookDateModal from './CookDateModal';

jest.mock('../utils/imageUtils', () => ({
  isBase64Image: jest.fn(() => false),
}));

jest.mock('../utils/recipeCookDates', () => ({
  setCookDate: () => Promise.resolve(true),
  getAllCookDates: () => Promise.resolve([]),
  deleteCookDate: () => Promise.resolve(),
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
