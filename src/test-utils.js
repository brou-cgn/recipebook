import React from 'react';
import { render } from '@testing-library/react';
import { NutritionReferenceProvider } from './contexts/NutritionReferenceContext';

/**
 * Rendert eine Komponente mit den App-weiten Providern, die Komponenten per
 * Hook voraussetzen. Der NutritionReferenceProvider läuft deaktiviert
 * (enabled={false}): kein Firestore-Zugriff, die Referenzliste ist leer.
 *
 * Über `wrapper` eingebunden, damit auch `rerender` die Provider behält.
 */
function AllProviders({ children }) {
  return <NutritionReferenceProvider enabled={false}>{children}</NutritionReferenceProvider>;
}

export function renderWithProviders(ui, options = {}) {
  return render(ui, { wrapper: AllProviders, ...options });
}
