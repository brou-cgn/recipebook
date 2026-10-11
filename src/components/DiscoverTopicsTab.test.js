import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import DiscoverTopicsTab from './DiscoverTopicsTab';
import * as topicsApi from '../utils/discoverTopics';

jest.mock('../utils/discoverTopics', () => ({
  ...jest.requireActual('../utils/discoverTopics'),
  subscribeToDiscoverTopics: jest.fn(),
  saveDiscoverTopic: jest.fn(),
  deleteDiscoverTopic: jest.fn(),
}));
jest.mock('../firebase', () => ({ db: {} }));

const admin = { id: 'u1', role: 'admin', isAdmin: true, vorname: 'Ada', nachname: 'A' };
const recipes = [{ id: 'r1', title: 'Kürbissuppe' }, { id: 'r2', title: 'Risotto' }];
const topic = {
  id: 't1', rubrik: 'Saison', beschreibung: 'Kürbis-Zeit',
  recipeIds: ['r1'], periodStart: '09-15', periodEnd: '11-30', isActive: true,
};

const setup = (topics = [topic], user = admin) => {
  topicsApi.saveDiscoverTopic.mockResolvedValue('new');
  topicsApi.deleteDiscoverTopic.mockResolvedValue();
  topicsApi.subscribeToDiscoverTopics.mockImplementation((cb) => { cb(topics); return () => {}; });
  return render(<DiscoverTopicsTab currentUser={user} allRecipes={recipes} />);
};

afterEach(() => jest.useRealTimers());

test('non-admins get no list and no subscription', () => {
  setup([topic], { id: 'u2', role: 'edit' });
  expect(screen.getByText(/Nur Administratoren/)).toBeInTheDocument();
  expect(topicsApi.subscribeToDiscoverTopics).not.toHaveBeenCalled();
});

test('shows the four columns for each topic', () => {
  setup();
  ['Rubrik', 'Beschreibung', 'Relevante Rezepte', 'Zeitraum'].forEach((h) => {
    expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument();
  });
  expect(screen.getByText('Kürbis-Zeit')).toBeInTheDocument();
  expect(screen.getByText('1 Rezept')).toBeInTheDocument();
  expect(screen.getByText('15. September – 30. November')).toBeInTheDocument();
});

test('creates a topic with recipes and period', async () => {
  setup([]);
  fireEvent.click(screen.getByText('Thema hinzufügen'));
  fireEvent.change(screen.getByLabelText('Rubrik'), { target: { value: 'Anlass' } });
  fireEvent.change(screen.getByLabelText(/Beschreibung/), { target: { value: 'Weihnachten' } });
  fireEvent.click(screen.getByLabelText('Ganzjährig'));
  fireEvent.change(screen.getByLabelText('Von: Tag'), { target: { value: '15' } });
  fireEvent.change(screen.getByLabelText('Von: Monat'), { target: { value: '12' } });
  fireEvent.change(screen.getByLabelText('Bis: Tag'), { target: { value: '6' } });
  fireEvent.change(screen.getByLabelText('Bis: Monat'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('Rezept suchen'), { target: { value: 'risot' } });
  fireEvent.click(screen.getByRole('button', { name: 'Risotto' }));
  fireEvent.click(screen.getByText('Speichern'));

  await waitFor(() => expect(topicsApi.saveDiscoverTopic).toHaveBeenCalled());
  expect(topicsApi.saveDiscoverTopic.mock.calls[0][0]).toMatchObject({
    rubrik: 'Anlass', beschreibung: 'Weihnachten', periodStart: '12-15', periodEnd: '01-06', recipeIds: ['r2'],
  });
});

test('invalid form shows the validation message and does not save', () => {
  setup([]);
  fireEvent.click(screen.getByText('Thema hinzufügen'));
  fireEvent.click(screen.getByText('Speichern'));
  expect(screen.getByText('Bitte eine Rubrik angeben.')).toBeInTheDocument();
  expect(topicsApi.saveDiscoverTopic).not.toHaveBeenCalled();
});

test('delete hides the row at once, deletes after 6 s, undo keeps it', () => {
  jest.useFakeTimers();
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Saison entfernen' }));
  expect(screen.queryByText('Kürbis-Zeit')).not.toBeInTheDocument();
  expect(topicsApi.deleteDiscoverTopic).not.toHaveBeenCalled();

  fireEvent.click(screen.getByText('Rückgängig'));
  expect(screen.getByText('Kürbis-Zeit')).toBeInTheDocument();
  act(() => { jest.advanceTimersByTime(7000); });
  expect(topicsApi.deleteDiscoverTopic).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Saison entfernen' }));
  act(() => { jest.advanceTimersByTime(6000); });
  expect(topicsApi.deleteDiscoverTopic).toHaveBeenCalledWith('t1');
});
