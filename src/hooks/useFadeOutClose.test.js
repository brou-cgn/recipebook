import { renderHook, act } from '@testing-library/react';
import useFadeOutClose, { FADE_OUT_MS } from './useFadeOutClose';

describe('useFadeOutClose', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('ruft onClose erst nach dem Fade-out auf', () => {
    const onClose = jest.fn();
    const { result } = renderHook(() => useFadeOutClose(onClose));
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(FADE_OUT_MS));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(result.current[0]).toBe(false);
  });

  it('ignoriert wiederholtes Schließen während des Fade-outs', () => {
    const onClose = jest.fn();
    const { result } = renderHook(() => useFadeOutClose(onClose));
    act(() => { result.current[1](); result.current[1](); });
    act(() => jest.advanceTimersByTime(FADE_OUT_MS));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ruft nach dem Unmount nichts mehr auf', () => {
    const onClose = jest.fn();
    const { result, unmount } = renderHook(() => useFadeOutClose(onClose));
    act(() => result.current[1]());
    unmount();
    act(() => jest.advanceTimersByTime(FADE_OUT_MS));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('schließt bei „Bewegung reduzieren" sofort', () => {
    const original = window.matchMedia;
    window.matchMedia = jest.fn().mockReturnValue({ matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() });
    const onClose = jest.fn();
    const { result } = renderHook(() => useFadeOutClose(onClose));
    act(() => result.current[1]());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(result.current[0]).toBe(false);
    window.matchMedia = original;
  });
});
