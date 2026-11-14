import React, { useRef } from 'react';
import { render } from '@testing-library/react';
import useStepCardFit, { fitStepCards } from './useStepCardFit';

// jsdom rechnet kein Layout: Höhe des Inhalts je Schriftstufe vorgeben (Karte 300 px hoch)
function mockCard(card, heightsByLevel) {
  Object.defineProperty(card, 'clientHeight', { configurable: true, get: () => 300 });
  Object.defineProperty(card, 'scrollHeight', {
    configurable: true,
    get: () => heightsByLevel[Number(card.getAttribute('data-fit') || 0)],
  });
}

function container(...heights) {
  const root = document.createElement('div');
  heights.forEach((byLevel) => {
    const card = document.createElement('div');
    card.className = 'step-card';
    mockCard(card, byLevel);
    root.appendChild(card);
  });
  return root;
}

describe('fitStepCards (Feinschliff Tablet, Punkt 6)', () => {
  test('ein Schritt, der passt, bleibt in der Grundgröße', () => {
    const root = container([280, 250, 220]);
    fitStepCards(root);
    expect(root.children[0].hasAttribute('data-fit')).toBe(false);
  });

  test('passt er nicht, wird er eine Stufe kleiner, dann noch eine; je Karte für sich', () => {
    const root = container([340, 290, 260], [420, 360, 310], [300, 280, 250]);
    fitStepCards(root);
    expect(root.children[0].getAttribute('data-fit')).toBe('1');
    // Passt auch in der kleinsten Stufe nicht: bleibt dort, die Karte scrollt
    expect(root.children[1].getAttribute('data-fit')).toBe('2');
    expect(root.children[2].hasAttribute('data-fit')).toBe(false);
  });

  test('misst neu von der Grundgröße aus, wenn sich der Platz geändert hat', () => {
    const root = container([340, 290, 260]);
    fitStepCards(root);
    expect(root.children[0].getAttribute('data-fit')).toBe('1');

    mockCard(root.children[0], [280, 250, 220]);
    fitStepCards(root);
    expect(root.children[0].hasAttribute('data-fit')).toBe(false);
  });
});

describe('useStepCardFit', () => {
  function Steps({ enabled, heights }) {
    const ref = useRef(null);
    useStepCardFit(ref, enabled, 'key');
    return (
      <div ref={ref}>
        <div className="step-card" ref={(el) => el && mockCard(el, heights)} />
      </div>
    );
  }

  test('setzt die Stufe nur, wenn er eingeschaltet ist (Tablet), und nimmt sie sonst wieder weg', () => {
    const { container: root, rerender } = render(<Steps enabled heights={[340, 290, 260]} />);
    const card = root.querySelector('.step-card');
    expect(card.getAttribute('data-fit')).toBe('1');

    rerender(<Steps enabled={false} heights={[340, 290, 260]} />);
    expect(card.hasAttribute('data-fit')).toBe(false);
  });
});
