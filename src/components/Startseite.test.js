import React from 'react';
import { render, screen } from '@testing-library/react';
import Startseite from './Startseite';

describe('Startseite', () => {
  test('renders without crashing', () => {
    const { container } = render(<Startseite currentUser={{ id: 'u1' }} />);
    expect(container.querySelector('.startseite-container')).toBeInTheDocument();
  });

  test('renders without a currentUser', () => {
    const { container } = render(<Startseite />);
    expect(container.querySelector('.startseite-container')).toBeInTheDocument();
  });
});
