import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import CallLogPanel, { expandCallDays, formatCallPeriod } from './CallLogPanel';

const at = (iso) => ({ toDate: () => new Date(iso) });

const rawCall = (id, vorname, nachname, extra = {}) => ({
  id, userId: `u-${id}`, userVorname: vorname, userNachname: nachname, isGuest: false,
  timestamp: at('2026-11-10T09:00:00Z'), ...extra,
});

const aggregate = (id, extra = {}) => ({
  id, period: '2026-10', periodType: 'month', year: 2026, month: 10,
  userId: `u-${id}`, userVorname: 'Max', userNachname: 'Mustermann', isGuest: false, count: 3, ...extra,
});

const getEmail = (userId) => ({ 'u-max': 'max@example.com' }[userId] || '');

const renderPanel = (props = {}) => renderWithProviders(
  <CallLogPanel
    kind="app"
    log={{ loading: false, calls: [], aggregates: [] }}
    limit={5000}
    canSeeEmails={false}
    getEmail={getEmail}
    {...props}
  />
);

const aggregatesTable = () => within(screen.getByRole('region', { name: 'Zusammengefasste Aufrufe' })).getByRole('table');

describe('formatCallPeriod', () => {
  it('names days, months and years', () => {
    expect(formatCallPeriod({ periodType: 'day', period: '2026-11-03' })).toBe('03.11.2026');
    expect(formatCallPeriod({ periodType: 'month', year: 2026, month: 10, period: '2026-10' })).toBe('Oktober 2026');
    expect(formatCallPeriod({ periodType: 'month', year: 2027, month: 1, period: '2027-01' })).toBe('Januar 2027');
    expect(formatCallPeriod({ periodType: 'year', year: 2025, period: '2025' })).toBe('Jahr 2025');
    expect(formatCallPeriod({ period: '2024-xx' })).toBe('2024-xx');
    expect(formatCallPeriod({})).toBe('–');
  });
});

describe('CallLogPanel', () => {
  it('shows the loading state, then the empty state', () => {
    const { rerender } = renderPanel({ log: { loading: true, calls: [], aggregates: [] } });
    expect(screen.getByText('Laden...')).toBeInTheDocument();
    rerender(
      <CallLogPanel kind="recipe" log={{ loading: false, calls: [], aggregates: [] }} limit={5000} canSeeEmails={false} getEmail={getEmail} />
    );
    expect(screen.getByText('Noch keine Rezeptaufrufe vorhanden.')).toBeInTheDocument();
  });

  it('lists consolidated calls per user and period, newest period first, most calls first', () => {
    renderPanel({
      log: {
        loading: false,
        calls: [],
        aggregates: [
          aggregate('a', { period: '2025', periodType: 'year', year: 2025, month: undefined, count: 120, userVorname: 'Anna', userNachname: 'Alt' }),
          aggregate('b', { count: 2, userVorname: 'Ben', userNachname: 'Bauer' }),
          aggregate('c', { count: 1234, userVorname: 'Cleo', userNachname: 'Chef' }),
          aggregate('g', { userId: null, isGuest: true, userVorname: 'Gast', userNachname: '', count: 7 }),
        ],
      },
    });

    const rows = within(aggregatesTable()).getAllByRole('row').slice(1)
      .map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent));
    expect(rows).toEqual([
      ['Oktober 2026', 'Cleo', 'Chef', 'Angemeldet', '1.234'],
      ['Oktober 2026', 'Alle Gäste', '', 'Gast', '7'],
      ['Oktober 2026', 'Ben', 'Bauer', 'Angemeldet', '2'],
      ['Jahr 2025', 'Anna', 'Alt', 'Angemeldet', '120'],
    ]);
    expect(screen.getByText('Keine Einzelaufrufe in den letzten 14 Tagen.')).toBeInTheDocument();
    expect(screen.getByText(/Zusammengefasst:/).textContent).toBe('Zusammengefasst: 1.363 Aufrufe in 4 Einträgen');
  });

  it('shows raw calls with the recipe column on the recipe tab, no owner filter there', () => {
    renderPanel({
      kind: 'recipe',
      log: {
        loading: false,
        calls: [rawCall('1', 'Benjamin', 'Rousselli', { recipeTitle: 'Gulasch' })],
        aggregates: [],
      },
    });
    expect(screen.getByRole('columnheader', { name: 'Rezept' })).toBeInTheDocument();
    expect(screen.getByText('Gulasch')).toBeInTheDocument();
    expect(screen.getByText('Rousselli')).toBeInTheDocument();
    expect(screen.queryByLabelText('Benjamin Rousselli ausblenden')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Zusammengefasste Aufrufe' })).not.toBeInTheDocument();
  });

  it('owner filter hides own raw calls and own consolidated entries alike', () => {
    renderPanel({
      ownerFilter: true,
      log: {
        loading: false,
        calls: [rawCall('1', 'Benjamin', 'Rousselli'), rawCall('2', 'Max', 'Mustermann')],
        aggregates: [
          aggregate('b', { userVorname: 'Benjamin', userNachname: 'Rousselli', count: 50 }),
          aggregate('max', { count: 4 }),
        ],
      },
    });

    expect(screen.queryByText('Rousselli')).not.toBeInTheDocument();
    expect(screen.getByText(/von 2 Einträgen \(gefiltert\)/)).toBeInTheDocument();
    expect(screen.getByText(/Zusammengefasst:/).textContent).toBe('Zusammengefasst: 4 Aufrufe in 1 Eintrag (gefiltert)');

    fireEvent.click(screen.getByLabelText('Benjamin Rousselli ausblenden'));
    expect(screen.getAllByText('Rousselli')).toHaveLength(2);
    expect(screen.getByText(/Zusammengefasst:/).textContent).toBe('Zusammengefasst: 54 Aufrufe in 2 Einträgen');
  });

  it('e-mail column only for admins, resolved from the user profiles, never for the guest bucket', () => {
    const log = {
      loading: false,
      calls: [rawCall('max', 'Max', 'Mustermann')],
      aggregates: [aggregate('max'), aggregate('g', { userId: null, isGuest: true, userVorname: 'Gast', userNachname: '' })],
    };
    const { unmount } = renderPanel({ log, canSeeEmails: false });
    expect(screen.queryByRole('columnheader', { name: 'E-Mail' })).not.toBeInTheDocument();
    expect(screen.queryByText('max@example.com')).not.toBeInTheDocument();
    unmount();

    renderPanel({ log, canSeeEmails: true });
    expect(screen.getAllByRole('columnheader', { name: 'E-Mail' })).toHaveLength(2);
    expect(screen.getAllByText('max@example.com')).toHaveLength(2);
  });

  it('shows day documents as one row per user and day, newest first, above the months', () => {
    renderPanel({
      ownerFilter: true,
      log: {
        loading: false,
        calls: [],
        days: [
          {
            id: '2026-11-03', day: '2026-11-03', count: 9,
            users: {
              max: { userId: 'u-max', isGuest: false, userVorname: 'Max', userNachname: 'Mustermann', count: 4 },
              gaeste: { userId: null, isGuest: true, userVorname: 'Gast', userNachname: '', count: 2 },
              b: { userId: 'u-b', isGuest: false, userVorname: 'Benjamin', userNachname: 'Rousselli', count: 3 },
            },
          },
          {
            id: '2026-11-10', day: '2026-11-10', count: 1,
            users: { max: { userId: 'u-max', isGuest: false, userVorname: 'Max', userNachname: 'Mustermann', count: 1 } },
          },
        ],
        aggregates: [aggregate('max', { count: 30 })],
      },
    });

    const rows = within(aggregatesTable()).getAllByRole('row').slice(1)
      .map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent));
    expect(rows).toEqual([
      ['10.11.2026', 'Max', 'Mustermann', 'Angemeldet', '1'],
      ['03.11.2026', 'Max', 'Mustermann', 'Angemeldet', '4'],
      ['03.11.2026', 'Alle Gäste', '', 'Gast', '2'],
      ['Oktober 2026', 'Max', 'Mustermann', 'Angemeldet', '30'],
    ]);
    expect(screen.getByText(/Zusammengefasst:/).textContent).toBe('Zusammengefasst: 37 Aufrufe in 4 Einträgen (gefiltert)');
  });

  it('expandCallDays tolerates incomplete day documents', () => {
    expect(expandCallDays(undefined)).toEqual([]);
    expect(expandCallDays([{ id: '2026-11-03' }])).toEqual([]);
    expect(expandCallDays([{ id: '2026-11-03', users: { x: null } }])).toEqual([
      { id: '2026-11-03_x', period: '2026-11-03', periodType: 'day', userId: null, isGuest: false, userVorname: '', userNachname: '', count: undefined },
    ]);
  });

  it('says when the raw calls hit the read limit', () => {
    renderPanel({
      limit: 2,
      log: { loading: false, calls: [rawCall('1', 'Max', 'A'), rawCall('2', 'Max', 'B')], aggregates: [] },
    });
    expect(screen.getByText('Angezeigt werden die neuesten 2 Einzelaufrufe.')).toBeInTheDocument();
  });
});
