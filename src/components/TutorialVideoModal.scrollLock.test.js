import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TutorialVideoModal from './TutorialVideoModal';

// Regression guard for the iPhone restarts that were reported when closing a
// tutorial video (see the scroll-lock comment in TutorialVideoModal.js).
//
// The dialog opens from inside the fully rendered recipe grid, so the
// position:fixed scroll-lock trick used elsewhere forced a complete re-layout
// of a very long document twice - once on open, once on close. These tests
// pin down that the lock stays layout-neutral: only body overflow is touched,
// and it is restored exactly as it was found.
describe('TutorialVideoModal scroll lock', () => {
  afterEach(() => {
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
  });

  test('locks scrolling via overflow only - never moves the document', () => {
    render(<TutorialVideoModal videoId="abcdefghijk" title="Zwiebeln schneiden" onClose={() => {}} />);

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.position).toBe('');
    expect(document.body.style.top).toBe('');
    expect(document.body.style.width).toBe('');
  });

  test('restores the previous overflow value on close', () => {
    document.body.style.overflow = 'scroll';

    const { unmount } = render(
      <TutorialVideoModal videoId="abcdefghijk" title="Zwiebeln schneiden" onClose={() => {}} />
    );
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('scroll');
  });

  test('blocks touch scrolling on the overlay instead', () => {
    const { container } = render(
      <TutorialVideoModal videoId="abcdefghijk" title="Zwiebeln schneiden" onClose={() => {}} />
    );
    const overlay = container.querySelector('.tutorial-video-modal-overlay');

    const touchMove = new Event('touchmove', { bubbles: true, cancelable: true });
    overlay.dispatchEvent(touchMove);

    expect(touchMove.defaultPrevented).toBe(true);
  });

  test('closes immediately when no iframe was ever created', () => {
    const onClose = jest.fn();
    render(<TutorialVideoModal videoId="abcdefghijk" title="Zwiebeln schneiden" onClose={onClose} />);

    fireEvent.click(screen.getByLabelText('Schließen'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
