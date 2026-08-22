import { updateAppBadge } from './appBadge';

describe('updateAppBadge', () => {
  afterEach(() => {
    delete navigator.setAppBadge;
    delete navigator.clearAppBadge;
  });

  test('sets the badge count when the Badging API is available', () => {
    navigator.setAppBadge = jest.fn().mockResolvedValue();
    navigator.clearAppBadge = jest.fn().mockResolvedValue();

    updateAppBadge(3);

    expect(navigator.setAppBadge).toHaveBeenCalledWith(3);
    expect(navigator.clearAppBadge).not.toHaveBeenCalled();
  });

  test('clears the badge when the count is zero', () => {
    navigator.setAppBadge = jest.fn().mockResolvedValue();
    navigator.clearAppBadge = jest.fn().mockResolvedValue();

    updateAppBadge(0);

    expect(navigator.clearAppBadge).toHaveBeenCalled();
    expect(navigator.setAppBadge).not.toHaveBeenCalled();
  });

  test('does nothing when the Badging API is unsupported', () => {
    expect(() => updateAppBadge(5)).not.toThrow();
  });
});
