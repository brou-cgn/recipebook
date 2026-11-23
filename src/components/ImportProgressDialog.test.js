import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import ImportProgressDialog from './ImportProgressDialog';

const jobs = [
  { id: '1', label: 'Foto-Scan (3 Bilder)', status: 'processing', progress: 42, canRestart: true },
  { id: '2', label: 'https://example.com/rezept', status: 'error', error: 'Import fehlgeschlagen', canRestart: true },
];

const zeige = (sprache) => renderWithProviders(
  <ImportProgressDialog
    jobs={jobs}
    onClose={() => {}}
    onDismissJob={() => {}}
    onRestartJob={() => {}}
    onCancelJob={() => {}}
    onUndoDelete={() => {}}
  />,
  { sprache }
);

describe('ImportProgressDialog', () => {
  beforeEach(() => {
    window.scrollTo = jest.fn();
  });

  it('zeigt gespeicherte Bezeichnungen und Fehler auf Deutsch wie gespeichert', () => {
    zeige('de');
    expect(screen.getByText('2 aktiv')).toBeInTheDocument();
    expect(screen.getByText('Foto-Scan (3 Bilder)')).toBeInTheDocument();
    expect(screen.getByText('Analysiert · 42 %')).toBeInTheDocument();
    expect(screen.getByText('Import fehlgeschlagen')).toBeInTheDocument();
  });

  it('übersetzt sie beim Anzeigen (Mehrsprachigkeit PR 6i)', () => {
    zeige('fr');
    expect(screen.getByRole('heading', { name: 'Import de recette' })).toBeInTheDocument();
    expect(screen.getByText('2 actifs')).toBeInTheDocument();
    expect(screen.getByText('Scan photo (3 images)')).toBeInTheDocument();
    expect(screen.getByText('Échec de l’import')).toBeInTheDocument();
    // URLs bleiben, wie sie sind
    expect(screen.getByText('https://example.com/rezept')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Relancer Scan photo (3 images)' })).toBeInTheDocument();
  });
});
