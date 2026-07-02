import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AtelierOnboardingOverlay from './AtelierOnboardingOverlay';

describe('AtelierOnboardingOverlay', () => {
  test('renders the overlay with title, body text and Weiter button', () => {
    render(<AtelierOnboardingOverlay onConfirm={() => {}} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Dein Atelier, dein Kreativraum')).toBeInTheDocument();
    expect(screen.getByText(/Meine Kochideen/)).toBeInTheDocument();
    expect(screen.getByText(/Meine Alltagsklassiker/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Weiter/i })).toBeInTheDocument();
  });

  test('calls onConfirm when Weiter button is clicked', () => {
    const onConfirm = jest.fn();
    render(<AtelierOnboardingOverlay onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: /Weiter/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test('shows spotlight when Atelier button is in the DOM', () => {
    // Create a mock Atelier button in the document
    const mockBtn = document.createElement('button');
    mockBtn.setAttribute('aria-label', 'Atelier');
    mockBtn.getBoundingClientRect = () => ({
      left: 100, top: 700, width: 60, height: 60, right: 160, bottom: 760,
    });
    document.body.appendChild(mockBtn);

    const { container } = render(<AtelierOnboardingOverlay onConfirm={() => {}} />);

    expect(container.querySelector('[data-testid="atelier-onboarding-spotlight"]')).toBeTruthy();

    document.body.removeChild(mockBtn);
  });

  test('does not render spotlight when Atelier button is not in the DOM', () => {
    const { container } = render(<AtelierOnboardingOverlay onConfirm={() => {}} />);

    expect(container.querySelector('[data-testid="atelier-onboarding-spotlight"]')).toBeNull();
  });
});
