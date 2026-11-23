import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import ListenUebersetzungen from './ListenUebersetzungen';
import { SpracheProvider } from '../contexts/SpracheContext';
import { saveListenUebersetzungen, subscribeListenUebersetzungen } from '../utils/customLists';
import { schlageListenUebersetzungenVor } from '../utils/uebersetzungCallables';

jest.mock('../utils/customLists', () => ({ saveListenUebersetzungen: jest.fn(), subscribeListenUebersetzungen: jest.fn() }));
jest.mock('../utils/uebersetzungCallables', () => ({ schlageListenUebersetzungenVor: jest.fn() }));

const LISTS = {
  cuisineTypes: ['Italienische Küche', 'Deutsche Küche'],
  mealCategories: [],
  portionUnits: [{ id: 'portion', singular: 'Portion', plural: 'Portionen' }],
};
const GESPEICHERT = {
  cuisineTypes: [{ wert: 'Italienische Küche', en: 'Italian cuisine', fr: 'Cuisine italienne' }],
};

const zeige = ({ kiVorschlaege = true, uebersetzungen = GESPEICHERT } = {}) => render(
  <SpracheProvider listenUebersetzungen={uebersetzungen} speicher={null}>
    <ListenUebersetzungen lists={LISTS} kiVorschlaege={kiVorschlaege} />
  </SpracheProvider>
);

/** Übersetzungen der Automatik für „Deutsche Küche“, noch nicht geprüft (PR 6t). */
const MIT_KI = {
  cuisineTypes: [
    ...GESPEICHERT.cuisineTypes,
    { wert: 'Deutsche Küche', en: 'German cuisine', fr: 'Cuisine allemande', kiUngeprueft: ['en', 'fr'] },
  ],
};

let abmelden;
/** Liefert neue Übersetzungen über das Abonnement, wie nach einem Lauf der Automatik. */
const sendeStand = (uebersetzungen) => act(() => {
  subscribeListenUebersetzungen.mock.calls.at(-1)[0](uebersetzungen);
});

describe('ListenUebersetzungen', () => {
  beforeEach(() => {
    saveListenUebersetzungen.mockReset();
    saveListenUebersetzungen.mockResolvedValue(undefined);
    abmelden = jest.fn();
    subscribeListenUebersetzungen.mockReset();
    subscribeListenUebersetzungen.mockReturnValue(abmelden);
  });

  it('zeigt je Liste die Werte mit ihren Übersetzungen und was noch offen ist', () => {
    zeige();
    expect(screen.getByText('Kulinarik-Typen')).toBeInTheDocument();
    // Kulinarik-Typen: „Deutsche Küche“ fehlt; Portionseinheiten: „Portion“ fehlt
    expect(screen.getAllByText('1 offen')).toHaveLength(2);
    expect(screen.getByLabelText('Italienische Küche, Englisch')).toHaveValue('Italian cuisine');
    expect(screen.getByLabelText('Deutsche Küche, Französisch')).toHaveValue('');
    expect(screen.getByLabelText('Portion, Englisch, Mehrzahl')).toHaveValue('');
    expect(screen.queryByText('Speisekategorien')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Übersetzungen speichern' })).toBeDisabled();
  });

  it('übernimmt KI-Vorschläge nur in leere Felder und speichert erst auf Knopfdruck', async () => {
    schlageListenUebersetzungenVor.mockResolvedValue({
      vorschlaege: [
        { liste: 'cuisineTypes', wert: 'Deutsche Küche', en: 'German cuisine', fr: 'Cuisine allemande' },
        { liste: 'portionUnits', wert: 'portion', en: { einzahl: 'serving', mehrzahl: 'servings' }, fr: { einzahl: 'portion', mehrzahl: 'portions' } },
      ],
    });
    zeige();
    fireEvent.click(screen.getByRole('button', { name: 'Fehlende mit KI vorschlagen (2)' }));
    await screen.findByText('2 Vorschläge eingetragen. Bitte prüfen und speichern.');
    expect(schlageListenUebersetzungenVor).toHaveBeenCalledWith([
      { liste: 'cuisineTypes', wert: 'Deutsche Küche', text: 'Deutsche Küche' },
      { liste: 'portionUnits', wert: 'portion', einzahl: 'Portion', mehrzahl: 'Portionen' },
    ]);
    expect(screen.getByLabelText('Deutsche Küche, Englisch')).toHaveValue('German cuisine');
    expect(screen.getByLabelText('Portion, Französisch, Mehrzahl')).toHaveValue('portions');
    expect(saveListenUebersetzungen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Übersetzungen speichern' }));
    await screen.findByText('Übersetzungen gespeichert.');
    const gespeichert = saveListenUebersetzungen.mock.calls[0][0];
    expect(gespeichert.cuisineTypes).toHaveLength(2);
    expect(gespeichert.portionUnits[0].en).toEqual({ einzahl: 'serving', mehrzahl: 'servings' });
  });

  it('eine eigene Änderung lässt sich speichern, ein leeres Feld entfernt die Übersetzung', async () => {
    zeige();
    fireEvent.change(screen.getByLabelText('Italienische Küche, Englisch'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Übersetzungen speichern' }));
    await waitFor(() => expect(saveListenUebersetzungen).toHaveBeenCalled());
    expect(saveListenUebersetzungen.mock.calls[0][0].cuisineTypes).toEqual([
      { wert: 'Italienische Küche', fr: 'Cuisine italienne' },
    ]);
  });

  it('ergänzt bei Einheiten nur die leere Einzahl oder Mehrzahl', async () => {
    schlageListenUebersetzungenVor.mockResolvedValue({
      vorschlaege: [
        { liste: 'portionUnits', wert: 'portion', en: { einzahl: 'serving', mehrzahl: 'servings' }, fr: { einzahl: 'portion', mehrzahl: 'portions' } },
      ],
    });
    zeige();
    fireEvent.change(screen.getByLabelText('Portion, Englisch, Einzahl'), { target: { value: 'helping' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fehlende mit KI vorschlagen (2)' }));
    await screen.findByText('1 Vorschlag eingetragen. Bitte prüfen und speichern.');
    expect(screen.getByLabelText('Portion, Englisch, Einzahl')).toHaveValue('helping');
    expect(screen.getByLabelText('Portion, Englisch, Mehrzahl')).toHaveValue('servings');
    expect(screen.getByLabelText('Portion, Französisch, Einzahl')).toHaveValue('portion');
  });

  it('ohne Admin-Rechte kein KI-Knopf, von Hand pflegen geht', async () => {
    zeige({ kiVorschlaege: false });
    expect(screen.queryByRole('button', { name: /mit KI vorschlagen/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Deutsche Küche, Englisch'), { target: { value: 'German cuisine' } });
    fireEvent.click(screen.getByRole('button', { name: 'Übersetzungen speichern' }));
    await screen.findByText('Übersetzungen gespeichert.');
    expect(saveListenUebersetzungen.mock.calls[0][0].cuisineTypes).toHaveLength(2);
  });

  it('markiert Übersetzungen der Automatik, bis sie geändert oder als geprüft markiert sind', async () => {
    zeige({ uebersetzungen: MIT_KI });
    expect(screen.getByText('vollständig, 1 ungeprüft')).toBeInTheDocument();
    const zeile = screen.getByRole('row', { name: /Deutsche Küche/ });
    expect(within(zeile).getAllByText('KI')).toHaveLength(2);
    expect(within(screen.getByRole('row', { name: /Italienische Küche/ })).queryByText('KI')).not.toBeInTheDocument();

    // Wer eine Sprache ändert, hat sie geprüft
    fireEvent.change(screen.getByLabelText('Deutsche Küche, Englisch'), { target: { value: 'German' } });
    expect(within(zeile).getAllByText('KI')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Als geprüft markieren (1)' }));
    expect(within(zeile).queryByText('KI')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Als geprüft markieren/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Übersetzungen speichern' }));
    await screen.findByText('Übersetzungen gespeichert.');
    expect(saveListenUebersetzungen.mock.calls[0][0].cuisineTypes[1]).toEqual(
      { wert: 'Deutsche Küche', en: 'German', fr: 'Cuisine allemande' },
    );
  });

  it('zeigt Übersetzungen der Automatik ohne Neuladen, eigene Änderungen gehen vor', () => {
    const { unmount } = zeige();
    expect(screen.getAllByText('1 offen')).toHaveLength(2);
    sendeStand(MIT_KI);
    expect(screen.getByLabelText('Deutsche Küche, Englisch')).toHaveValue('German cuisine');
    expect(screen.getByText('vollständig, 1 ungeprüft')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Italienische Küche, Französisch'), { target: { value: 'Italienne' } });
    sendeStand(GESPEICHERT);
    expect(screen.getByLabelText('Italienische Küche, Französisch')).toHaveValue('Italienne');
    expect(screen.getByLabelText('Deutsche Küche, Englisch')).toHaveValue('German cuisine');

    unmount();
    expect(abmelden).toHaveBeenCalled();
  });

  it('meldet Fehler der KI-Vorschläge', async () => {
    schlageListenUebersetzungenVor.mockRejectedValue(Object.assign(new Error('Tageslimit erreicht'), { code: 'functions/resource-exhausted' }));
    zeige();
    fireEvent.click(screen.getByRole('button', { name: /Fehlende mit KI vorschlagen/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tageslimit erreicht');
  });
});
