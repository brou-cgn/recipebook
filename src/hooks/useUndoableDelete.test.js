import { act, renderHook } from '@testing-library/react';
import useUndoableDelete from './useUndoableDelete';

describe('useUndoableDelete', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const schedule = (result, overrides = {}) => {
    const onConfirm = jest.fn();
    const onUndo = jest.fn();
    act(() => {
      result.current.scheduleDelete({ key: 'item-1', message: '„Item" entfernt', onConfirm, onUndo, ...overrides });
    });
    return { onConfirm, onUndo };
  };

  test('confirms the delete after the undo window', () => {
    const { result } = renderHook(() => useUndoableDelete());
    const { onConfirm } = schedule(result);

    expect(result.current.pendingKeys.has('item-1')).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(6000);
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(result.current.banners).toHaveLength(0);
  });

  test('undo cancels the delete', () => {
    const { result } = renderHook(() => useUndoableDelete());
    const { onConfirm, onUndo } = schedule(result);

    act(() => {
      result.current.undoDelete(result.current.banners[0].id);
      jest.advanceTimersByTime(6000);
    });

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('leaving the view before the undo window ends commits the pending delete once', () => {
    const { result, unmount } = renderHook(() => useUndoableDelete());
    const { onConfirm } = schedule(result);

    unmount();
    expect(onConfirm).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(6000);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test('pagehide commits pending deletes and clears the banners', () => {
    const { result, unmount } = renderHook(() => useUndoableDelete());
    const { onConfirm } = schedule(result);

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(result.current.banners).toHaveLength(0);

    unmount();
    jest.advanceTimersByTime(6000);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test('an undone delete is not committed on unmount', () => {
    const { result, unmount } = renderHook(() => useUndoableDelete());
    const { onConfirm } = schedule(result);

    act(() => {
      result.current.undoDelete(result.current.banners[0].id);
    });
    unmount();

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
