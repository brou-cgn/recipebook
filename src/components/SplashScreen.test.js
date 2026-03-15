import React from 'react';
import { render, screen, act } from '@testing-library/react';
import SplashScreen from './SplashScreen';

describe('SplashScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders when visible is true', () => {
    render(<SplashScreen visible={true} />);
    expect(screen.getByText('brouBook')).toBeInTheDocument();
  });

  test('renders logo from logoUrl prop', () => {
    render(<SplashScreen visible={true} logoUrl="http://example.com/logo.png" appTitle="MyApp" />);
    const img = screen.getByAltText('MyApp Logo');
    expect(img).toHaveAttribute('src', 'http://example.com/logo.png');
  });

  test('uses default logo when logoUrl is not provided', () => {
    render(<SplashScreen visible={true} appTitle="TestApp" />);
    const img = screen.getByAltText('TestApp Logo');
    expect(img).toHaveAttribute('src', '/logo192.png');
  });

  test('renders slogan', () => {
    render(<SplashScreen visible={true} slogan="My Slogan" />);
    expect(screen.getByText('My Slogan')).toBeInTheDocument();
  });

  test('uses default slogan when not provided', () => {
    render(<SplashScreen visible={true} />);
    expect(screen.getByText('Unsere besten Momente')).toBeInTheDocument();
  });

  test('starts fading out when visible becomes false', () => {
    const { rerender } = render(<SplashScreen visible={true} />);
    const splashEl = screen.getByText('brouBook').closest('.splash-screen');
    expect(splashEl).not.toHaveClass('splash-screen--fade-out');

    rerender(<SplashScreen visible={false} />);
    expect(splashEl).toHaveClass('splash-screen--fade-out');
  });

  test('removes itself from DOM after fallback timeout when visible becomes false', () => {
    const { rerender } = render(<SplashScreen visible={true} />);
    expect(screen.getByText('brouBook')).toBeInTheDocument();

    rerender(<SplashScreen visible={false} />);

    // Before the 700ms fallback, component should still be in the DOM (fading out)
    act(() => {
      jest.advanceTimersByTime(699);
    });
    expect(screen.queryByText('brouBook')).toBeInTheDocument();

    // After the 700ms fallback, the component should be removed
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.queryByText('brouBook')).not.toBeInTheDocument();
  });
});
