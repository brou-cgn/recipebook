import React from 'react';
import { render, waitFor, within } from '@testing-library/react';
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

    const { container } = render(
      <BottomNavigation tabs={tabs} activeKey="home" isVisible onSelect={() => {}} />
    );
    const fullBar = within(container.querySelector('.bottom-navigation'));

    expect(await fullBar.findByText('🍳')).toBeInTheDocument();
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

  test('renders configured active icon for the active tab', async () => {
    getButtonIcons.mockResolvedValue({
      bottomNavHome: '🍳',
      bottomNavHomeActive: '🔥',
      bottomNavRecipes: '📖',
    });

    const { container } = render(
      <BottomNavigation tabs={tabs} activeKey="home" isVisible onSelect={() => {}} />
    );
    const fullBar = within(container.querySelector('.bottom-navigation'));

    expect(await fullBar.findByText('🔥')).toBeInTheDocument();
    expect(fullBar.getByText('📖')).toBeInTheDocument();
    expect(fullBar.queryByText('🍳')).not.toBeInTheDocument();
  });

  test('pill navigation only shows Kochbuch, Festtafel and Atelier', async () => {
    const allTabs = [
      { key: 'home', label: 'Küche' },
      { key: 'recipes', label: 'Kochbuch' },
      { key: 'menus', label: 'Festtafel' },
      { key: 'atelier', label: 'Atelier' },
      { key: 'chef', label: 'Chefkoch' },
    ];

    const { container } = render(
      <BottomNavigation tabs={allTabs} activeKey="recipes" isVisible onSelect={() => {}} />
    );

    await waitFor(() => expect(getButtonIcons).toHaveBeenCalled());

    const pill = within(container.querySelector('.bottom-navigation-pill'));
    expect(pill.getByLabelText('Kochbuch')).toBeInTheDocument();
    expect(pill.getByLabelText('Festtafel')).toBeInTheDocument();
    expect(pill.getByLabelText('Atelier')).toBeInTheDocument();
    expect(pill.queryByLabelText('Küche')).not.toBeInTheDocument();
    expect(pill.queryByLabelText('Chefkoch')).not.toBeInTheDocument();
  });
});
