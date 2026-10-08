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

  test('Ziehen auf einem Button startet keine Verschiebung', () => {
    const { result } = renderHook(() => useCookingModeTabPosition('u1'));
    const button = document.createElement('button');
    act(() => {
      result.current.handleProps.onPointerDown({ target: button, currentTarget: button, clientY: 100, pointerId: 1 });
      result.current.handleProps.onPointerMove({ clientY: 300 });
      result.current.handleProps.onPointerUp();
    });
    expect(result.current.top).toBe(DEFAULT_TAB_TOP);
    expect(localStorage.getItem('cookingModeTabTop_u1')).toBeNull();
  });

  test('Ziehen auf der Lasche verschiebt und speichert die Position', () => {
    const { result } = renderHook(() => useCookingModeTabPosition('u1'));
    const area = document.createElement('div');
    act(() => {
      result.current.handleProps.onPointerDown({ target: area, currentTarget: area, clientY: 100, pointerId: 1 });
      result.current.handleProps.onPointerMove({ clientY: 100 + window.innerHeight * 0.1 });
    });
    expect(result.current.top).toBeCloseTo(DEFAULT_TAB_TOP + 0.1);
    act(() => {
      result.current.handleProps.onPointerUp();
    });
    expect(parseFloat(localStorage.getItem('cookingModeTabTop_u1'))).toBeCloseTo(DEFAULT_TAB_TOP + 0.1);
  });
});
