import { renderHook, waitFor } from '@testing-library/react';
import useCallLog from './useCallLog';

describe('useCallLog', () => {
  it('loads nothing while the tab is inactive', () => {
    const load = jest.fn(() => Promise.resolve({ calls: [], aggregates: [] }));
    const { result } = renderHook(() => useCallLog(load, false));
    expect(load).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);
  });

  it('loads once on first activation and keeps the data when the tab is left and reopened', async () => {
    const load = jest.fn(() => Promise.resolve({ calls: [{ id: 'c1' }], aggregates: [{ id: 'a1' }] }));
    const { result, rerender } = renderHook(({ active }) => useCallLog(load, active), {
      initialProps: { active: false },
    });

    rerender({ active: true });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.calls).toEqual([{ id: 'c1' }]);
    expect(result.current.aggregates).toEqual([{ id: 'a1' }]);

    rerender({ active: false });
    rerender({ active: true });
    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current.calls).toEqual([{ id: 'c1' }]);
  });

  it('finishes loading even if the tab is left before the data arrives', async () => {
    let resolve;
    const load = jest.fn(() => new Promise((r) => { resolve = r; }));
    const { result, rerender } = renderHook(({ active }) => useCallLog(load, active), {
      initialProps: { active: true },
    });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    rerender({ active: false });
    resolve({ calls: [{ id: 'c1' }], aggregates: [] });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.calls).toEqual([{ id: 'c1' }]);
  });

  it('ends in an empty, loaded state when loading fails', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const load = jest.fn(() => Promise.reject(new Error('offline')));
    const { result } = renderHook(() => useCallLog(load, true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({ loading: false, calls: [], aggregates: [] });
    error.mockRestore();
  });
});
