import { screen } from '@testing-library/react';
import TagesmenuFilterOverlay from './TagesmenuFilterOverlay';
import { renderWithProviders } from '../test-utils';

describe('TagesmenuFilterOverlay in anderer Sprache (Mehrsprachigkeit PR 6n)', () => {
  const zeige = (sprache) => renderWithProviders(
    <TagesmenuFilterOverlay
      isOpen
      onClose={() => {}}
      interactiveLists={[{ id: 'l1', name: 'Sommerküche' }, { id: 'l2', name: 'Feierabend' }]}
      selectedListId="l1"
      onSelectList={() => {}}
      categoryOptions={['Hauptspeisen']}
      selectedCategories={[]}
      onSelectCategory={() => {}}
    />,
    { sprache }
  );

  test('Englisch: Dialog, Filter und Suche in der Sprache, Listennamen bleiben', () => {
    zeige('en');
    expect(screen.getByRole('dialog', { name: 'Filter cooking studio' })).toBeInTheDocument();
    expect(screen.getByTitle('Filter by Hauptspeisen')).toBeInTheDocument();
    expect(screen.getByTitle('Active list')).toHaveTextContent('Sommerküche');
    expect(screen.getByTitle('Switch to Feierabend')).toBeInTheDocument();
    expect(screen.getByLabelText('Search lists')).toHaveAttribute('placeholder', 'Search lists…');
  });

  test('Französisch: Liste wechseln', () => {
    zeige('fr');
    expect(screen.getByTitle('Passer à Feierabend')).toBeInTheDocument();
  });
});

describe('TagesmenuFilterOverlay: Systemliste „Für dich entdeckt“ (Mehrsprachigkeit PR 6p)', () => {
  test('Englisch: der Name der Systemliste ist übersetzt, eigene Namen bleiben', () => {
    renderWithProviders(
      <TagesmenuFilterOverlay
        isOpen
        onClose={() => {}}
        interactiveLists={[
          { id: 'fde', name: 'Für dich entdeckt', systemKey: 'fuerDichEntdeckt' },
          { id: 'l2', name: 'Feierabend' },
        ]}
        selectedListId="l2"
        onSelectList={() => {}}
        categoryOptions={[]}
        selectedCategories={[]}
        onSelectCategory={() => {}}
      />,
      { sprache: 'en' }
    );
    expect(screen.getByTitle('Switch to Discovered for you')).toHaveTextContent('Discovered for you');
    expect(screen.queryByText('Für dich entdeckt')).not.toBeInTheDocument();
    expect(screen.getByTitle('Active list')).toHaveTextContent('Feierabend');
  });
});
