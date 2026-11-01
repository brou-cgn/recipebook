import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import CookingCoverDiagnostics from './CookingCoverDiagnostics';
import { isViewportCoverActive } from '../hooks/useViewportFitCover';

jest.mock('../hooks/useViewportFitCover', () => ({
  isViewportCoverActive: jest.fn(() => false),
}));

// Kochmodus quer mit Schiene, so wie RecipeDetail ihn rendert (stark verkürzt)
function Layout() {
  return (
    <div className="recipe-detail-content cooking-mode-landscape">
      <nav className="cooking-rail">
        <ul>
          <li className="cooking-rail-item"><button type="button" className="cooking-rail-button">Rotkohl</button></li>
        </ul>
        <button type="button" className="cooking-mode-add-recipe">Plus</button>
      </nav>
      <section className="cooking-mode-steps"><p>Schritt</p></section>
      <CookingCoverDiagnostics />
    </div>
  );
}

function touchEnd(element, x, y) {
  fireEvent.touchEnd(element, { changedTouches: [{ clientX: x, clientY: y, screenX: x + 59, screenY: y }] });
}

afterEach(() => {
  isViewportCoverActive.mockReturnValue(false);
});

describe('CookingCoverDiagnostics', () => {
  test('ohne viewport-fit=cover zeigt es nichts', () => {
    render(<Layout />);
    expect(screen.queryByText(/Diagnose Rand/)).toBeNull();
  });

  test('mit cover: Geometrie und Bitte um einen Tipp; danach, wo der Tipp ankam', () => {
    isViewportCoverActive.mockReturnValue(true);
    render(<Layout />);

    expect(screen.getByText(/Diagnose Rand · Seite/)).toBeInTheDocument();
    expect(screen.getByText(/Bitte einmal mitten auf einen Kreis der Schiene tippen/)).toBeInTheDocument();

    act(() => { touchEnd(screen.getByText('Rotkohl'), 811, 54); });
    expect(screen.getByText(/Tipp 811\/54 \(Bildschirm 870\/54\) → Rezept \(Schiene\)/)).toBeInTheDocument();

    act(() => { touchEnd(screen.getByText('Schritt'), 752, 344); });
    expect(screen.getByText(/Tipp 752\/344 .* → Schritte/)).toBeInTheDocument();

    act(() => { touchEnd(screen.getByText('Plus'), 811, 344); });
    expect(screen.getByText(/→ Plus \(Schiene\)/)).toBeInTheDocument();
  });

  test('die Zeile lässt Tipps durch und ist für Vorlesehilfen ausgeblendet', () => {
    isViewportCoverActive.mockReturnValue(true);
    render(<Layout />);
    const line = document.querySelector('.cooking-cover-diagnostics');
    expect(line).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('CookingCoverDiagnostics CSS', () => {
  // eslint-disable-next-line global-require
  const css = require('fs').readFileSync(require('path').join(__dirname, 'CookingCoverDiagnostics.css'), 'utf8');

  test('fängt keine Tipps ab und nutzt nur Farb-Tokens', () => {
    expect(css).toMatch(/\.cooking-cover-diagnostics \{[^}]*pointer-events: none;/);
    expect(css).toMatch(/\.cooking-cover-diagnostics-probe \{[^}]*pointer-events: none;/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
