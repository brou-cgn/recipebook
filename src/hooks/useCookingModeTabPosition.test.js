import { renderHook, act } from '@testing-library/react';
import useCookingModeTabPosition, { DEFAULT_TAB_TOP } from './useCookingModeTabPosition';

describe('useCookingModeTabPosition', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('startet mit der Standardposition', () => {
    const { result } = renderHook(() => useCookingModeTabPosition('u1'));
    expect(result.current.top).toBe(DEFAULT_TAB_TOP);
  });

  test('Pfeiltasten verschieben die Lasche und speichern je Anwender', () => {
    const { result } = renderHook(() => useCookingModeTabPosition('u1'));
    act(() => {
      result.current.handleProps.onKeyDown({ key: 'ArrowDown', preventDefault: () => {} });
    });
    expect(result.current.top).toBeGreaterThan(DEFAULT_TAB_TOP);
    const saved = parseFloat(localStorage.getItem('cookingModeTabTop_u1'));
    expect(saved).toBeCloseTo(result.current.top);
    expect(localStorage.getItem('cookingModeTabTop_u2')).toBeNull();
  });

  test('stellt die gespeicherte Position beim erneuten Öffnen wieder her', () => {
    localStorage.setItem('cookingModeTabTop_u1', '0.7');
    const { result } = renderHook(() => useCookingModeTabPosition('u1'));
    expect(result.current.top).toBeCloseTo(0.7);
    const { result: otherResult } = renderHook(() => useCookingModeTabPosition("u2"));
    expect(otherResult.current.top).toBe(DEFAULT_TAB_TOP);
  });

  test('klemmt die Position am oberen Rand', () => {
    localStorage.setItem('cookingModeTabTop_u1', '0.07');
    const { result } = renderHook(() => useCookingModeTabPosition('u1'));
    act(() => {
      result.current.handleProps.onKeyDown({ key: 'ArrowUp', preventDefault: () => {} });
    });
    expect(result.current.top).toBeGreaterThanOrEqual(0.06);
  });
});
