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

  test('pill navigation carousel keeps Küche and Chefkoch reachable by scrolling', async () => {
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

    // Kochbuch, Festtafel and Atelier are the three tabs visible by default
    // (activeKey is always one of these while the pill carousel is shown).
    // Küche and Chefkoch stay in the rail too, just scrolled out of view, so
    // the carousel can be scrolled to reach them.
    const pill = within(container.querySelector('.bottom-navigation-pill'));
    expect(pill.getByLabelText('Kochbuch')).toBeInTheDocument();
    expect(pill.getByLabelText('Festtafel')).toBeInTheDocument();
    expect(pill.getByLabelText('Atelier')).toBeInTheDocument();
    expect(pill.getByLabelText('Küche')).toBeInTheDocument();
    expect(pill.getByLabelText('Chefkoch')).toBeInTheDocument();
  });

  test('pill centers on Festtafel when it first opens, then centers the active tab afterwards', async () => {
    const allTabs = [
      { key: 'home', label: 'Küche' },
      { key: 'recipes', label: 'Kochbuch' },
      { key: 'menus', label: 'Festtafel' },
      { key: 'atelier', label: 'Atelier' },
      { key: 'chef', label: 'Chefkoch' },
    ];
    const labelOrder = allTabs.map((tab) => tab.label);

    const offsetLeftSpy = jest
      .spyOn(window.HTMLElement.prototype, 'offsetLeft', 'get')
      .mockImplementation(function offsetLeftMock() {
        const index = labelOrder.indexOf(this.getAttribute('aria-label'));
        return index >= 0 ? index * 100 : 0;
      });
    const offsetWidthSpy = jest
      .spyOn(window.HTMLElement.prototype, 'offsetWidth', 'get')
      .mockReturnValue(100);
    const clientWidthSpy = jest
      .spyOn(window.HTMLElement.prototype, 'clientWidth', 'get')
      .mockReturnValue(300);
    const scrollToMock = jest.fn();
    window.HTMLElement.prototype.scrollTo = scrollToMock;

    try {
      // Opening the pill on "Kochbuch" (recipes) should still center Festtafel first...
      const { rerender } = render(
        <BottomNavigation tabs={allTabs} activeKey="recipes" isVisible onSelect={() => {}} />
      );

      await waitFor(() => expect(getButtonIcons).toHaveBeenCalled());
      expect(scrollToMock).toHaveBeenNthCalledWith(1, { left: 100, behavior: 'auto' });
      // ...then animate onto the actually active tab (Kochbuch), same as any other switch.
      expect(scrollToMock).toHaveBeenLastCalledWith({ left: 0, behavior: 'smooth' });

      // Selecting a different pill tab afterwards centers that active tab instead.
      rerender(
        <BottomNavigation tabs={allTabs} activeKey="atelier" isVisible onSelect={() => {}} />
      );
      expect(scrollToMock).toHaveBeenLastCalledWith({ left: 200, behavior: 'smooth' });
    } finally {
      offsetLeftSpy.mockRestore();
      offsetWidthSpy.mockRestore();
      clientWidthSpy.mockRestore();
      delete window.HTMLElement.prototype.scrollTo;
    }
  });

  test('shows a count badge on a tab with pending items', async () => {
    const { container } = render(
      <BottomNavigation
        tabs={tabs}
        activeKey="home"
        isVisible
        onSelect={() => {}}
        badgeCounts={{ recipes: 3 }}
      />
    );

    await waitFor(() => expect(getButtonIcons).toHaveBeenCalled());

    const fullBar = within(container.querySelector('.bottom-navigation'));
    expect(fullBar.getByText('3')).toBeInTheDocument();
    expect(fullBar.getByLabelText('Kochbuch (3)')).toBeInTheDocument();
  });

  test('hides the badge and plain label when the count is zero', async () => {
    const { container } = render(
      <BottomNavigation
        tabs={tabs}
        activeKey="home"
        isVisible
        onSelect={() => {}}
        badgeCounts={{ recipes: 0 }}
      />
    );

    await waitFor(() => expect(getButtonIcons).toHaveBeenCalled());

    const fullBar = within(container.querySelector('.bottom-navigation'));
    expect(container.querySelector('.bottom-navigation__badge')).not.toBeInTheDocument();
    expect(fullBar.getByLabelText('Kochbuch')).toBeInTheDocument();
  });
});
