import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import DiscoverTopicsTab from './DiscoverTopicsTab';
import * as topicsApi from '../utils/discoverTopics';
import { useOptionalNutritionReference } from '../contexts/NutritionReferenceContext';
import { getCustomLists } from '../utils/customLists';

jest.mock('../utils/discoverTopics', () => ({
  ...jest.requireActual('../utils/discoverTopics'),
  subscribeToDiscoverTopics: jest.fn(),
  saveDiscoverTopic: jest.fn(),
  deleteDiscoverTopic: jest.fn(),
}));
jest.mock('../firebase', () => ({ db: {} }));
jest.mock('../contexts/NutritionReferenceContext', () => ({
  useOptionalNutritionReference: jest.fn(),
}));
jest.mock('../utils/customLists', () => ({
  getCustomLists: jest.fn(),
}));

const admin = { id: 'u1', role: 'admin', isAdmin: true, vorname: 'Ada', nachname: 'A' };
const recipes = [{ id: 'r1', title: 'Kürbissuppe' }, { id: 'r2', title: 'Risotto' }];
const topic = {
  id: 't1', rubrik: 'Saison', beschreibung: 'Kürbis-Zeit',
  recipeIds: ['r1'], periodStart: '09-15', periodEnd: '11-30', isActive: true,
};

const setup = (topics = [topic], user = admin) => {
  useOptionalNutritionReference.mockReturnValue({ rows: [{ ingredientID: 'Spargel', displayName: 'Spargel, weiß' }, { ingredientID: 'Tomate' }] });
  getCustomLists.mockResolvedValue({ cuisineTypes: ['Weihnachtliche Küche'], mealCategories: ['Salate', 'Desserts'] });
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

test('shows the columns for each topic', () => {
  setup();
  ['Rubrik', 'Beschreibung', 'Relevante Rezepte', 'Zeitraum', 'Anzeige-Dauer', 'Rezepte-Regel'].forEach((h) => {
    expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument();
  });
  expect(screen.getByText('Kürbis-Zeit')).toBeInTheDocument();
  expect(screen.getByText('1 Rezept')).toBeInTheDocument();
  expect(screen.getByText('15. September – 30. November')).toBeInTheDocument();
  expect(screen.getByText('7 Tage')).toBeInTheDocument();
});

test('shows display days and a summary of the rule', () => {
  setup([{
    ...topic,
    displayDays: 14,
    recipeRule: { ingredientIds: { include: ['Spargel'] }, lastCooked: { minDays: 365, maxDays: 365 } },
  }]);
  expect(screen.getByText('14 Tage')).toBeInTheDocument();
  expect(screen.getByText('Zutat: Spargel · gekocht vor genau 365 Tagen')).toBeInTheDocument();
});

test('saves display days and rule from the editor', async () => {
  setup([]);
  fireEvent.click(screen.getByText('Thema hinzufügen'));
  fireEvent.change(screen.getByLabelText('Rubrik'), { target: { value: 'Saison' } });
  fireEvent.change(screen.getByLabelText(/Beschreibung/), { target: { value: 'Spargelzeit' } });
  fireEvent.change(screen.getByLabelText(/Anzeige-Dauer/), { target: { value: '10' } });
  const ingredient = screen.getByLabelText('Zutat (ingredientID) einschließen');
  fireEvent.change(ingredient, { target: { value: 'spargl' } });
  fireEvent.click(screen.getByRole('button', { name: /Spargel/ }));
  fireEvent.change(screen.getByLabelText('Zuletzt gekocht: mindestens Tage'), { target: { value: '180' } });
  fireEvent.click(screen.getByText('Speichern'));

  await waitFor(() => expect(topicsApi.saveDiscoverTopic).toHaveBeenCalled());
  const saved = topicsApi.saveDiscoverTopic.mock.calls[0][0];
  expect(saved.displayDays).toBe('10');
  expect(saved.recipeRule.ingredientIds.include).toEqual(['Spargel']);
  expect(saved.recipeRule.lastCooked.minDays).toBe('180');
});

test('rejects a min larger than max in a rule range', () => {
  const rule = { lastCooked: { minDays: 400, maxDays: 180 } };
  expect(topicsApi.validateTopic({ rubrik: 'a', beschreibung: 'b', recipeRule: rule })).toMatch(/Zuletzt gekocht/);
  expect(topicsApi.validateTopic({ rubrik: 'a', beschreibung: 'b', displayDays: 0 })).toMatch(/Anzeige-Dauer/);
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

test('ingredient typeahead only adds IDs from the reference, not free text', () => {
  setup([]);
  fireEvent.click(screen.getByText('Thema hinzufügen'));
  const ingredient = screen.getByLabelText('Zutat (ingredientID) einschließen');
  fireEvent.change(ingredient, { target: { value: 'qqqq' } });
  fireEvent.keyDown(ingredient, { key: 'Enter' });
  expect(screen.queryByRole('button', { name: 'qqqq entfernen' })).not.toBeInTheDocument();
  fireEvent.change(ingredient, { target: { value: 'tomat' } });
  fireEvent.keyDown(ingredient, { key: 'Enter' });
  expect(screen.getByRole('button', { name: 'Tomate entfernen' })).toBeInTheDocument();
});
