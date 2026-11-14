import React from 'react';
import { screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { webcrypto } from 'crypto';
import { TextEncoder as NodeTextEncoder } from 'util';
import { renderWithProviders } from '../test-utils';
import { WeinbegleitungUebersicht, WeinbegleitungGang } from './Weinbegleitung';
import useMenueWeinbegleitung from '../hooks/useMenueWeinbegleitung';
import { generiereWeinprofile } from '../utils/weinbegleitung/weinprofilCallable';
import { saveMenuWeinbegleitung } from '../utils/menuFirestore';
import { berechneWeinbegleitung } from '../utils/weinbegleitung/engine';
import { erstelleSnapshot } from '../utils/weinbegleitung/menue';
import { weinprofilInputHash } from '../utils/weinbegleitung/profilHash';
import {
  rezept,
  festmenue,
  G1_LACHSTATAR,
  G5_RINDERSCHMORBRATEN,
  G6_SCHOKOLADENMOUSSE,
  E3_EXTREM,
} from '../utils/weinbegleitung/__fixtures__/profile';

jest.mock('../utils/weinbegleitung/weinprofilCallable', () => ({
  MAX_REZEPTE_JE_AUFRUF: 20,
  generiereWeinprofile: jest.fn(),
}));

jest.mock('../utils/menuFirestore', () => ({
  saveMenuWeinbegleitung: jest.fn(),
}));

// Wie in der App: Menü bearbeiten dürfen Admins und Autoren, KI ab Rolle edit
jest.mock('../utils/userManagement', () => ({
  canEditMenu: (user, menu) => user?.role === 'admin' || (Boolean(user) && menu?.authorId === user.id),
  canEditRecipes: (user) => ['edit', 'moderator', 'admin'].includes(user?.role),
}));

const AUTOR = { id: 'u1', role: 'edit' };
const LESER = { id: 'u2', role: 'read' };

function Menue({ menu, recipes, currentUser, isSharedView = false }) {
  const wein = useMenueWeinbegleitung({ menu, recipes, currentUser, isSharedView });
  return (
    <div>
      <WeinbegleitungUebersicht wein={wein} />
      {menu.sections.map((sektion, index) => (
        <section key={sektion.name} aria-label={sektion.name}>
          <h2>{sektion.name}</h2>
          <WeinbegleitungGang wein={wein} sektionIndex={index} sektionName={sektion.name} />
        </section>
      ))}
    </div>
  );
}

const ohneProfile = (rezepte) => rezepte.map(({ weinprofil: _weinprofil, ...rest }) => rest);

const festtafel = (extra = {}) => {
  const { menu, rezepte } = festmenue();
  return { menu: { ...menu, authorId: 'u1', ...extra }, rezepte };
};

const mitSnapshot = (menu, rezepte, optionen = {}) => {
  const ergebnis = berechneWeinbegleitung({ menu, rezepte, ...optionen });
  return { ...menu, weinbegleitung: erstelleSnapshot({ ergebnis, inputHash: optionen.inputHash ?? null, nutzerId: 'u1', jetzt: 1 }) };
};

const zeige = ({ menu, rezepte, nutzer = AUTOR, isSharedView = false }) => renderWithProviders(
  <Menue menu={menu} recipes={rezepte} currentUser={nutzer} isSharedView={isSharedView} />,
);

const gespeicherterSnapshot = (aufruf = 0) => saveMenuWeinbegleitung.mock.calls[aufruf][1];

beforeEach(() => {
  saveMenuWeinbegleitung.mockResolvedValue(undefined);
});

describe('Weinbegleitung erstellen', () => {
  it('zeigt Lesern ohne gespeicherte Weinbegleitung nichts', () => {
    const { menu, rezepte } = festtafel();
    zeige({ menu, rezepte, nutzer: LESER });
    expect(screen.queryByRole('region', { name: 'Weinbegleitung' })).not.toBeInTheDocument();
  });

  it('bietet auf Freigabe-Seiten keinen Knopf an, auch nicht dem Autor', () => {
    const { menu, rezepte } = festtafel();
    zeige({ menu, rezepte, isSharedView: true });
    expect(screen.queryByRole('button', { name: 'Weinbegleitung erstellen' })).not.toBeInTheDocument();
  });

  it('schätzt fehlende Profile in einem Aufruf, speichert den Snapshot und zeigt je Gang den Wein', async () => {
    const { menu, rezepte } = festtafel();
    generiereWeinprofile.mockResolvedValue({
      profile: { lachstatar: G1_LACHSTATAR, schmorbraten: G5_RINDERSCHMORBRATEN, mousse: G6_SCHOKOLADENMOUSSE },
      uebersprungen: [],
      fehlgeschlagen: [],
      fehlerGruende: {},
    });
    zeige({ menu, rezepte: ohneProfile(rezepte) });

    fireEvent.click(screen.getByRole('button', { name: 'Weinbegleitung erstellen' }));

    await waitFor(() => expect(saveMenuWeinbegleitung).toHaveBeenCalledTimes(1));
    expect(generiereWeinprofile).toHaveBeenCalledTimes(1);
    expect(generiereWeinprofile).toHaveBeenCalledWith(['lachstatar', 'schmorbraten', 'mousse']);
    expect(saveMenuWeinbegleitung.mock.calls[0][0]).toBe('menu-1');
    expect(gespeicherterSnapshot()).toEqual(expect.objectContaining({ modus: 'proGang', erstelltVon: 'u1' }));
    expect(gespeicherterSnapshot().gaenge.map((gang) => gang.stilId)).toEqual(['weiss_leicht_frisch', 'rot_kraeftig', 'likoerwein']);

    expect(await within(screen.getByRole('region', { name: 'Hauptgang' })).findByText('Rotwein, kräftig')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Drinks' })).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('3 Weine für 3 Gänge')).toBeInTheDocument();
  });

  it('teilt mehr als 20 Rezepte auf mehrere Aufrufe auf', async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `r${i}`);
    const menu = { id: 'm2', authorId: 'u1', sections: [{ name: 'Büfett', recipeIds: ids }] };
    generiereWeinprofile.mockImplementation(async (block) => ({
      profile: Object.fromEntries(block.map((id) => [id, G5_RINDERSCHMORBRATEN])),
      uebersprungen: [],
      fehlgeschlagen: [],
      fehlerGruende: {},
    }));
    zeige({ menu, rezepte: ids.map((id) => rezept(id)) });

    fireEvent.click(screen.getByRole('button', { name: 'Weinbegleitung erstellen' }));

    await waitFor(() => expect(saveMenuWeinbegleitung).toHaveBeenCalledTimes(1));
    expect(generiereWeinprofile.mock.calls.map(([block]) => block.length)).toEqual([20, 5]);
  });

  it('meldet teilweise fehlgeschlagene Einschätzungen und speichert trotzdem', async () => {
    const { menu, rezepte } = festtafel();
    generiereWeinprofile.mockResolvedValue({
      profile: { lachstatar: G1_LACHSTATAR, schmorbraten: G5_RINDERSCHMORBRATEN },
      uebersprungen: [],
      fehlgeschlagen: ['mousse'],
      fehlerGruende: { mousse: 'tageslimit' },
    });
    zeige({ menu, rezepte: ohneProfile(rezepte) });

    fireEvent.click(screen.getByRole('button', { name: 'Weinbegleitung erstellen' }));

    expect(await screen.findByText(/Ein Gericht konnte nicht eingeschätzt werden\. Das Tageslimit/)).toBeInTheDocument();
    expect(saveMenuWeinbegleitung).toHaveBeenCalledTimes(1);
    expect(within(screen.getByRole('region', { name: 'Dessert' })).getByText('Noch nicht eingeschätzt.')).toBeInTheDocument();
  });

  it('speichert nichts, wenn kein Gericht eingeschätzt werden konnte', async () => {
    const { menu, rezepte } = festtafel();
    generiereWeinprofile.mockRejectedValue(Object.assign(new Error('limit'), { code: 'functions/resource-exhausted' }));
    zeige({ menu, rezepte: ohneProfile(rezepte) });

    fireEvent.click(screen.getByRole('button', { name: 'Weinbegleitung erstellen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Tageslimit');
    expect(saveMenuWeinbegleitung).not.toHaveBeenCalled();
  });
});

describe('Gespeicherte Weinbegleitung', () => {
  it('zeigt Lesern das Ergebnis ohne KI-Aufruf und ohne Knöpfe', () => {
    const { menu, rezepte } = festtafel();
    zeige({ menu: mitSnapshot(menu, rezepte), rezepte, nutzer: LESER });

    expect(screen.getByText('3 Weine für 3 Gänge')).toBeInTheDocument();
    expect(screen.getByText('Pro Gang')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ein Wein für alles' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Weinbegleitung erstellen' })).not.toBeInTheDocument();

    const hauptgang = within(screen.getByRole('region', { name: 'Hauptgang' }));
    // Empfehlung und Weißwein-Option stehen offen da, jede mit drei Rebsorten
    const weine = hauptgang.getByRole('list', { name: 'Weine zu Hauptgang' });
    expect(within(weine).getAllByRole('listitem')).toHaveLength(2);
    expect(hauptgang.getByText('Weißwein, vollmundig')).toBeInTheDocument();
    expect(hauptgang.getByText(/Cabernet Sauvignon, Syrah, Malbec/)).toBeInTheDocument();
    expect(hauptgang.getByText(/Grauburgunder, Chardonnay mit Holz, Viognier/)).toBeInTheDocument();
    expect(hauptgang.getByText('Empfehlung · passt hervorragend')).toBeInTheDocument();
    expect(hauptgang.getByText('passt bedingt')).toBeInTheDocument();

    const zeile = hauptgang.getByRole('button', { name: /Rotwein, kräftig/ });
    expect(zeile).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(zeile);
    expect(zeile).toHaveAttribute('aria-expanded', 'true');
    expect(hauptgang.getByRole('heading', { name: 'Warum passt das?' })).toBeInTheDocument();
    // Ohne Quellen, wie im Rezept-Sheet
    expect(hauptgang.queryAllByRole('link')).toHaveLength(0);
    expect(hauptgang.queryByRole('button', { name: /als Empfehlung festlegen/ })).not.toBeInTheDocument();

    // Die Option unter S_MIN erklärt ihr „passt bedingt“
    fireEvent.click(hauptgang.getByRole('button', { name: /Weißwein, vollmundig/ }));
    expect(hauptgang.getByText(/Die beste Wahl in dieser Farbe/)).toBeInTheDocument();
    expect(zeile).toHaveAttribute('aria-expanded', 'false');

    expect(generiereWeinprofile).not.toHaveBeenCalled();
    expect(saveMenuWeinbegleitung).not.toHaveBeenCalled();
  });

  it('wechselt für Bearbeiter den Modus ohne KI-Aufruf', async () => {
    const { menu, rezepte } = festtafel();
    zeige({ menu: mitSnapshot(menu, rezepte), rezepte });

    fireEvent.click(screen.getByRole('button', { name: 'Ein Wein für alles' }));

    await waitFor(() => expect(saveMenuWeinbegleitung).toHaveBeenCalledTimes(1));
    expect(gespeicherterSnapshot().modus).toBe('einWein');
    expect(await screen.findByText('Ein Wein für alle Gänge außer dem Dessert: Weiß oder Rot.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ein Wein für alles' })).toHaveAttribute('aria-pressed', 'true');
    // Die Weine stehen jetzt im Kopf, nicht mehr unter den Gängen
    expect(screen.getByRole('list', { name: 'Ein Wein für alle Gänge' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Hauptgang' })).queryByRole('list')).not.toBeInTheDocument();
    expect(generiereWeinprofile).not.toHaveBeenCalled();
  });

  it('legt eine Option als Empfehlung fest (fixiert), „Fixierung lösen“ hebt es auf', async () => {
    const { menu, rezepte } = festtafel();
    zeige({ menu: mitSnapshot(menu, rezepte), rezepte });
    const vorspeise = within(screen.getByRole('region', { name: 'Vorspeise' }));

    fireEvent.click(vorspeise.getByRole('button', { name: /Rotwein, leicht/ }));
    fireEvent.click(vorspeise.getByRole('button', { name: '„Rotwein, leicht“ als Empfehlung festlegen' }));

    await waitFor(() => expect(saveMenuWeinbegleitung).toHaveBeenCalledTimes(1));
    expect(gespeicherterSnapshot().fixierungen).toEqual([{ sektionIndex: 0, sektionName: 'Vorspeise', stilId: 'rot_leicht' }]);
    expect(gespeicherterSnapshot().gaenge[0]).toEqual(expect.objectContaining({ stilId: 'rot_leicht', fixiert: true }));
    // Jetzt rückt eine Weißwein-Option nach
    expect(gespeicherterSnapshot().gaenge[0].optionen.map((option) => option.farbe)).toEqual(['weiss']);
    expect(await vorspeise.findByText('· fixiert')).toBeInTheDocument();
    expect(generiereWeinprofile).not.toHaveBeenCalled();

    const zeile = vorspeise.getByRole('button', { name: /Rotwein, leicht/ });
    if (zeile.getAttribute('aria-expanded') === 'false') fireEvent.click(zeile);
    fireEvent.click(await vorspeise.findByRole('button', { name: 'Fixierung lösen' }));

    await waitFor(() => expect(saveMenuWeinbegleitung).toHaveBeenCalledTimes(2));
    expect(gespeicherterSnapshot(1).fixierungen).toEqual([]);
    expect(gespeicherterSnapshot(1).gaenge[0].stilId).toBe('weiss_leicht_frisch');
  });

  it('zeigt einen Gang ohne passenden Stil als „Hier lieber Bier oder Wasser“', () => {
    const menu = { id: 'm3', authorId: 'u1', sections: [{ name: 'Zwischengang', recipeIds: ['extrem'] }, { name: 'Hauptgang', recipeIds: ['braten'] }] };
    const rezepte = [rezept('extrem', E3_EXTREM), rezept('braten', G5_RINDERSCHMORBRATEN)];
    zeige({ menu: mitSnapshot(menu, rezepte), rezepte, nutzer: LESER });
    const zwischengang = within(screen.getByRole('region', { name: 'Zwischengang' }));
    expect(zwischengang.getByText(/Hier lieber Bier oder Wasser\. Wer trotzdem Wein möchte:/)).toBeInTheDocument();
    // Auch hier je eine Rot- und eine Weißwein-Option, ehrlich als „passt bedingt“
    expect(zwischengang.getAllByRole('listitem')).toHaveLength(2);
    expect(zwischengang.getAllByText('passt bedingt')).toHaveLength(2);
    expect(zwischengang.queryByText(/Empfehlung ·/)).not.toBeInTheDocument();
  });
});

describe('Ein Wein für alles', () => {
  const einWein = (menu, rezepte, optionen = {}) => mitSnapshot(menu, rezepte, { modus: 'einWein', ...optionen });

  it('zeigt im Kopf je eine Weiß- und eine Rotwein-Option mit dem Gang, zu dem sie am besten passt, und keine Weine je Gang', () => {
    const { menu, rezepte } = festtafel();
    zeige({ menu: einWein(menu, rezepte), rezepte, nutzer: LESER });

    const kopf = within(screen.getByRole('region', { name: 'Weinbegleitung' }));
    expect(kopf.getByText('Ein Wein für alle Gänge außer dem Dessert: Weiß oder Rot.')).toBeInTheDocument();
    expect(kopf.getByText('Ein Wein für alles')).toBeInTheDocument();

    const weine = within(kopf.getByRole('list', { name: 'Ein Wein für alle Gänge' }));
    const [rot, weiss] = weine.getAllByRole('listitem');
    expect(weine.getAllByRole('listitem')).toHaveLength(2);
    expect(within(rot).getByText('Rotwein, mittelkräftig')).toBeInTheDocument();
    expect(within(rot).getByText('Empfehlung · passt')).toBeInTheDocument();
    expect(within(rot).getByText('Am besten zu: Hauptgang')).toBeInTheDocument();
    expect(within(weiss).getByText('Weißwein, vollmundig')).toBeInTheDocument();
    expect(within(weiss).getByText('passt bedingt')).toBeInTheDocument();
    expect(within(weiss).getByText(/Grauburgunder, Chardonnay mit Holz, Viognier/)).toBeInTheDocument();

    // Das Dessert bekommt seinen eigenen Wein, ebenfalls im Kopf
    expect(within(kopf.getByRole('list', { name: 'Wein zu Dessert' })).getByText('Likörwein')).toBeInTheDocument();

    // Unter den Gängen keine Weinzeilen mehr
    ['Vorspeise', 'Hauptgang', 'Dessert'].forEach((name) => {
      const gang = within(screen.getByRole('region', { name }));
      expect(gang.queryByRole('list')).not.toBeInTheDocument();
      expect(gang.queryByRole('button')).not.toBeInTheDocument();
    });

    // Aufgeklappt: Label und Gründe je Gang, ohne Quellen und für Leser ohne Knöpfe
    fireEvent.click(within(rot).getByRole('button', { name: /Rotwein, mittelkräftig/ }));
    expect(within(rot).getByRole('heading', { name: 'Warum passt das?' })).toBeInTheDocument();
    expect(within(rot).getByRole('heading', { name: 'Vorspeise: passt' })).toBeInTheDocument();
    expect(within(rot).getByRole('heading', { name: 'Hauptgang: passt' })).toBeInTheDocument();
    expect(within(rot).queryAllByRole('link')).toHaveLength(0);
    expect(kopf.queryByRole('button', { name: /als Empfehlung festlegen/ })).not.toBeInTheDocument();

    expect(generiereWeinprofile).not.toHaveBeenCalled();
    expect(saveMenuWeinbegleitung).not.toHaveBeenCalled();
  });

  it('legt im Kopf die andere Farbe als Empfehlung fest, „Fixierung lösen“ hebt es auf', async () => {
    const { menu, rezepte } = festtafel();
    zeige({ menu: einWein(menu, rezepte), rezepte });
    const kopf = within(screen.getByRole('region', { name: 'Weinbegleitung' }));

    fireEvent.click(kopf.getByRole('button', { name: /Weißwein, vollmundig/ }));
    expect(kopf.getByText(/Die beste Wahl in dieser Farbe, aber nicht zu jedem Gang/)).toBeInTheDocument();
    fireEvent.click(kopf.getByRole('button', { name: '„Weißwein, vollmundig“ als Empfehlung festlegen' }));

    await waitFor(() => expect(saveMenuWeinbegleitung).toHaveBeenCalledTimes(1));
    expect(gespeicherterSnapshot()).toEqual(expect.objectContaining({
      modus: 'einWein',
      gemeinsamerStilId: 'weiss_voll',
      gewaehlterGemeinsamerStilId: 'weiss_voll',
    }));
    expect(gespeicherterSnapshot().einWeinOptionen.map((option) => option.stilId)).toEqual(['weiss_voll', 'rot_mittel']);
    expect(await kopf.findByText('· fixiert')).toBeInTheDocument();
    expect(generiereWeinprofile).not.toHaveBeenCalled();

    const zeile = kopf.getByRole('button', { name: /Weißwein, vollmundig/ });
    if (zeile.getAttribute('aria-expanded') === 'false') fireEvent.click(zeile);
    fireEvent.click(await kopf.findByRole('button', { name: 'Fixierung lösen' }));

    await waitFor(() => expect(saveMenuWeinbegleitung).toHaveBeenCalledTimes(2));
    expect(gespeicherterSnapshot(1).gewaehlterGemeinsamerStilId).toBeNull();
    expect(gespeicherterSnapshot(1).gemeinsamerStilId).toBe('rot_mittel');
  });

  it('zeigt am Gang nur den Hinweis, wenn er ohne Wein bleibt', () => {
    const menu = { id: 'm3', authorId: 'u1', sections: [{ name: 'Zwischengang', recipeIds: ['extrem'] }, { name: 'Hauptgang', recipeIds: ['braten'] }] };
    const rezepte = [rezept('extrem', E3_EXTREM), rezept('braten', G5_RINDERSCHMORBRATEN)];
    zeige({ menu: einWein(menu, rezepte), rezepte, nutzer: LESER });

    const zwischengang = within(screen.getByRole('region', { name: 'Zwischengang' }));
    expect(zwischengang.getByText('Hier lieber Bier oder Wasser.')).toBeInTheDocument();
    expect(zwischengang.queryByRole('list')).not.toBeInTheDocument();
    // Mit nur einem Gang im Kopf gibt es kein „Am besten zu“
    expect(screen.getByText('Rotwein, kräftig')).toBeInTheDocument();
    expect(screen.queryByText(/Am besten zu/)).not.toBeInTheDocument();
  });

  it('zeigt einen älteren Snapshot ohne Optionen im Kopf bis „Neu berechnen“ wie bisher je Gang', () => {
    const { menu, rezepte } = festtafel();
    const neu = einWein(menu, rezepte);
    const { einWeinOptionen: _optionen, ...alt } = neu.weinbegleitung;
    zeige({ menu: { ...neu, weinbegleitung: alt }, rezepte, nutzer: LESER });

    expect(screen.getByText('Ein Wein für alles: Rotwein, mittelkräftig')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Ein Wein für alle Gänge' })).not.toBeInTheDocument();
    const hauptgang = within(screen.getByRole('region', { name: 'Hauptgang' }));
    expect(hauptgang.getByText('Rotwein, mittelkräftig')).toBeInTheDocument();
    expect(hauptgang.getByText('Empfehlung · passt')).toBeInTheDocument();
  });
});

describe('Veraltete Weinbegleitung', () => {
  beforeAll(() => {
    if (typeof globalThis.TextEncoder === 'undefined') globalThis.TextEncoder = NodeTextEncoder;
  });

  beforeEach(() => {
    global.crypto = { subtle: webcrypto.subtle };
  });

  afterEach(() => {
    global.crypto = undefined;
  });

  // Profile mit echtem inputHash, damit sie als aktuell gelten
  const mitAktuellenProfilen = async (rezepte) => Promise.all(rezepte.map(async (r) => ({
    ...r,
    weinprofil: { ...r.weinprofil, inputHash: await weinprofilInputHash(r, { subtle: webcrypto.subtle }) },
  })));

  it('bietet „Neu berechnen“ an und schätzt nur das geänderte Rezept neu', async () => {
    const { menu, rezepte } = festtafel();
    const aktuell = await mitAktuellenProfilen(rezepte);
    const geaendert = aktuell.map((r) => (r.id === 'schmorbraten' ? { ...r, title: 'Schmorbraten mit Pilzen' } : r));
    generiereWeinprofile.mockResolvedValue({
      profile: { schmorbraten: { ...G5_RINDERSCHMORBRATEN, erstelltAm: 99 } },
      uebersprungen: [],
      fehlgeschlagen: [],
      fehlerGruende: {},
    });
    zeige({ menu: mitSnapshot(menu, aktuell, { inputHash: 'alt' }), rezepte: geaendert });

    fireEvent.click(await screen.findByRole('button', { name: 'Neu berechnen' }));

    await waitFor(() => expect(saveMenuWeinbegleitung).toHaveBeenCalledTimes(1));
    expect(generiereWeinprofile).toHaveBeenCalledWith(['schmorbraten']);
    expect(gespeicherterSnapshot().inputHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('zeigt Lesern nur den Hinweis', async () => {
    const { menu, rezepte } = festtafel();
    zeige({ menu: mitSnapshot(menu, rezepte, { inputHash: 'alt' }), rezepte, nutzer: LESER });
    expect(await screen.findByText('Menü oder Rezepte wurden seit der Berechnung geändert.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Neu berechnen' })).not.toBeInTheDocument();
  });

  it('zeigt Gästen auf der Freigabe-Seite das Ergebnis, ohne Hinweis, Knöpfe und KI-Aufruf', async () => {
    const { menu, rezepte } = festtafel();
    zeige({ menu: mitSnapshot(menu, rezepte, { inputHash: 'alt' }), rezepte, nutzer: null, isSharedView: true });

    expect(screen.getByText('3 Weine für 3 Gänge')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Hauptgang' })).getByText('Rotwein, kräftig')).toBeInTheDocument();
    // Ohne Freigabe-Seite käme der Hinweis nach der asynchronen Hash-Prüfung
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    expect(screen.queryByText('Menü oder Rezepte wurden seit der Berechnung geändert.')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Weinbegleitung' })).queryByRole('button')).not.toBeInTheDocument();
    expect(generiereWeinprofile).not.toHaveBeenCalled();
    expect(saveMenuWeinbegleitung).not.toHaveBeenCalled();
  });

  it('zeigt keinen Hinweis, wenn Menü und Profile zum Snapshot passen', async () => {
    const { menu, rezepte } = festtafel();
    const aktuell = await mitAktuellenProfilen(rezepte);
    const { menueInputHash } = jest.requireActual('../utils/weinbegleitung/menue');
    const inputHash = await menueInputHash(menu, aktuell, { subtle: webcrypto.subtle });
    zeige({ menu: mitSnapshot(menu, aktuell, { inputHash }), rezepte: aktuell });
    await screen.findByText('3 Weine für 3 Gänge');
    // Die Prüfung läuft asynchron (Web Crypto): erst abwarten, dann prüfen
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    expect(screen.queryByText('Menü oder Rezepte wurden seit der Berechnung geändert.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Neu berechnen' })).not.toBeInTheDocument();
  });
});
