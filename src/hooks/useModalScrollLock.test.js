import React from 'react';
import { render } from '@testing-library/react';
import useModalScrollLock from './useModalScrollLock';

function Probe({ active }) {
  useModalScrollLock(active);
  return null;
}

describe('useModalScrollLock', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  test('sperrt body-Overflow solange aktiv und stellt den alten Wert wieder her', () => {
    document.body.style.overflow = 'scroll';
    const { unmount } = render(<Probe active />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('scroll');
  });

  test('tut nichts, solange inaktiv', () => {
    render(<Probe active={false} />);
    expect(document.body.style.overflow).toBe('');
  });

  test('blockiert touchmove auf dem Hintergrund, nicht im scrollbaren Dialogbereich', () => {
    const { container, unmount } = render(
      <>
        <Probe active />
        <div data-testid="backdrop">
          <div aria-modal="true" role="dialog">
            <div data-testid="list" style={{ overflowY: 'auto' }} />
          </div>
        </div>
      </>
    );
    const backdrop = container.querySelector('[data-testid="backdrop"]');
    const list = container.querySelector('[data-testid="list"]');
    // jsdom hat kein Layout: scrollHeight/clientHeight künstlich setzen
    Object.defineProperty(list, 'scrollHeight', { value: 500, configurable: true });
    Object.defineProperty(list, 'clientHeight', { value: 100, configurable: true });

    const onBackdrop = new Event('touchmove', { bubbles: true, cancelable: true });
    backdrop.dispatchEvent(onBackdrop);
    expect(onBackdrop.defaultPrevented).toBe(true);

    const onList = new Event('touchmove', { bubbles: true, cancelable: true });
    list.dispatchEvent(onList);
    expect(onList.defaultPrevented).toBe(false);

    unmount();
    const afterUnmount = new Event('touchmove', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(afterUnmount);
    expect(afterUnmount.defaultPrevented).toBe(false);
  });
});
