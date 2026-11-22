import React from 'react';
import { render } from '@testing-library/react';
import { NutritionReferenceProvider } from './contexts/NutritionReferenceContext';
import { SpracheProvider } from './contexts/SpracheContext';

/**
 * Rendert eine Komponente mit den App-weiten Providern, die Komponenten per
 * Hook voraussetzen. Der NutritionReferenceProvider läuft deaktiviert
 * (enabled={false}): kein Firestore-Zugriff, die Referenzliste ist leer.
 *
 * Sprache: Standard Deutsch; `renderWithProviders(ui, { sprache: 'en' })` rendert
 * auf Englisch (bzw. 'fr'). Übersetzte Inhalte (Rezepttitel) zeigt es nur mit
 * `{ inhalteUebersetzen: true }`, wie die App mit der Berechtigung sprachwahl.
 * Die Sitzungs-Sprache wird dabei nirgends gespeichert, Tests beeinflussen sich
 * also nicht gegenseitig.
 *
 * Über `wrapper` eingebunden, damit auch `rerender` die Provider behält.
 */
function AllProviders({ children, sprache, inhalteUebersetzen }) {
  return (
    <SpracheProvider profilSprache={sprache} speicher={null} inhalteUebersetzen={inhalteUebersetzen}>
      <NutritionReferenceProvider enabled={false}>{children}</NutritionReferenceProvider>
    </SpracheProvider>
  );
}

export function renderWithProviders(ui, { sprache = 'de', inhalteUebersetzen = false, ...options } = {}) {
  const Wrapper = ({ children }) => (
    <AllProviders sprache={sprache} inhalteUebersetzen={inhalteUebersetzen}>{children}</AllProviders>
  );
  return render(ui, { wrapper: Wrapper, ...options });
}
