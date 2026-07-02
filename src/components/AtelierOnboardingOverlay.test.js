import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AtelierOnboardingOverlay, { BUBBLE_HORIZONTAL_INSET } from './AtelierOnboardingOverlay';

describe('AtelierOnboardingOverlay', () => {
  const originalInnerWidth = window.innerWidth;

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    });
  });

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
    const buttonLeft = 100;
    const buttonWidth = 60;
    const viewportWidth = 300;

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: viewportWidth,
    });

    // Create a mock Atelier button in the document
    const mockBtn = document.createElement('button');
    mockBtn.setAttribute('aria-label', 'Atelier');
    mockBtn.getBoundingClientRect = () => ({
      left: buttonLeft, top: 700, width: buttonWidth, height: 60, right: buttonLeft + buttonWidth, bottom: 760,
    });
    document.body.appendChild(mockBtn);

    const { container } = render(<AtelierOnboardingOverlay onConfirm={() => {}} />);
    const bubble = container.querySelector('[data-testid="atelier-onboarding-bubble"]');
    const expectedArrowLeft = (
      (buttonLeft + buttonWidth / 2 - BUBBLE_HORIZONTAL_INSET) /
      (viewportWidth - BUBBLE_HORIZONTAL_INSET * 2)
    ) * 100;

    expect(container.querySelector('[data-testid="atelier-onboarding-spotlight"]')).toBeTruthy();
    expect(parseFloat(bubble.style.getPropertyValue('--arrow-left'))).toBeCloseTo(expectedArrowLeft, 4);

    document.body.removeChild(mockBtn);
  });

  test('does not render spotlight when Atelier button is not in the DOM', () => {
    const { container } = render(<AtelierOnboardingOverlay onConfirm={() => {}} />);

    expect(container.querySelector('[data-testid="atelier-onboarding-spotlight"]')).toBeNull();
  });
});
