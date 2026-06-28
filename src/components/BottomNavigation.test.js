import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import BottomNavigation from './BottomNavigation';

jest.mock('../utils/customLists', () => ({
  ...jest.requireActual('../utils/customLists'),
  getButtonIcons: jest.fn(),
}));

const { getButtonIcons } = require('../utils/customLists');

describe('BottomNavigation icon rendering', () => {
  const tabs = [
    { key: 'home', label: 'Küche' },
    { key: 'recipes', label: 'Kochbuch' },
  ];

  beforeEach(() => {
    getButtonIcons.mockResolvedValue({});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders fallback SVG icon when no custom icon is configured', async () => {
    const { container } = render(
      <BottomNavigation tabs={tabs} activeKey="home" isVisible onSelect={() => {}} />
    );

    await waitFor(() => expect(getButtonIcons).toHaveBeenCalled());

    expect(container.querySelector('.bottom-navigation__tab svg')).toBeTruthy();
  });

  test('renders configured text icon from button icon list', async () => {
    getButtonIcons.mockResolvedValue({ bottomNavHome: '🍳' });

    render(<BottomNavigation tabs={tabs} activeKey="home" isVisible onSelect={() => {}} />);

    expect(await screen.findByText('🍳')).toBeInTheDocument();
  });

  test('renders configured image icon from button icon list', async () => {
    const iconData = 'data:image/png;base64,AAA=';
    getButtonIcons.mockResolvedValue({ bottomNavHome: iconData });

    const { container } = render(
      <BottomNavigation tabs={tabs} activeKey="home" isVisible onSelect={() => {}} />
    );

    await waitFor(() => {
      expect(container.querySelector('.bottom-navigation__icon-image')).toBeTruthy();
    });

    expect(container.querySelector('.bottom-navigation__icon-image').getAttribute('src')).toBe(iconData);
  });
});
