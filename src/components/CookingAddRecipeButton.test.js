import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import CookingAddRecipeButton from './CookingAddRecipeButton';
import { isBase64Image } from '../utils/imageUtils';

jest.mock('../utils/imageUtils', () => ({
  isBase64Image: jest.fn(),
}));

const IMAGE_ICON = 'data:image/png;base64,QUJD';
const NAME = 'Weiteres Rezept dazunehmen';

beforeEach(() => {
  isBase64Image.mockImplementation((value) => typeof value === 'string' && value.startsWith('data:image/'));
});

describe('CookingAddRecipeButton', () => {
  test('shows only the icon, no text; label and tooltip name the action', () => {
    render(<CookingAddRecipeButton icon={IMAGE_ICON} onClick={() => {}} />);

    const button = screen.getByRole('button', { name: NAME });
    expect(button).toHaveAttribute('title', NAME);
    expect(button.textContent.trim()).toBe('');
    expect(button.querySelector('img')).toHaveAttribute('src', IMAGE_ICON);
  });

  test('shows a configured text icon when it is not an image', () => {
    render(<CookingAddRecipeButton icon="+" onClick={() => {}} />);

    const button = screen.getByRole('button', { name: NAME });
    expect(button.querySelector('img')).toBeNull();
    expect(button).toHaveTextContent('+');
  });

  test('stays hidden until the button icons are loaded, like the FAB buttons', () => {
    const { rerender } = render(<CookingAddRecipeButton icon={IMAGE_ICON} loaded={false} onClick={() => {}} />);
    expect(screen.getByRole('button', { hidden: true })).toHaveStyle({ visibility: 'hidden' });

    rerender(<CookingAddRecipeButton icon={IMAGE_ICON} loaded onClick={() => {}} />);
    expect(screen.getByRole('button', { name: NAME })).toHaveStyle({ visibility: 'visible' });
  });

  test('calls onClick', () => {
    const onClick = jest.fn();
    render(<CookingAddRecipeButton icon={IMAGE_ICON} onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: NAME }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  describe('press animation (class "pressed", as on the FAB buttons)', () => {
    const renderButton = () => {
      render(<CookingAddRecipeButton icon={IMAGE_ICON} onClick={() => {}} />);
      return screen.getByRole('button', { name: NAME });
    };

    test('mouse: pressed while the button is held, released on mouse up and when the pointer leaves', () => {
      const button = renderButton();
      expect(button).not.toHaveClass('pressed');

      fireEvent.mouseDown(button);
      expect(button).toHaveClass('pressed');
      fireEvent.mouseUp(button);
      expect(button).not.toHaveClass('pressed');

      fireEvent.mouseDown(button);
      fireEvent.mouseLeave(button);
      expect(button).not.toHaveClass('pressed');
    });

    test('touch: pressed on touch start, released on touch end and on touch cancel', () => {
      const button = renderButton();

      fireEvent.touchStart(button);
      expect(button).toHaveClass('pressed');
      fireEvent.touchEnd(button);
      expect(button).not.toHaveClass('pressed');

      fireEvent.touchStart(button);
      fireEvent.touchCancel(button);
      expect(button).not.toHaveClass('pressed');
    });
  });
});
