import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import RecipeVersionDescribe from './RecipeVersionDescribe';

const recipe = { id: 'r1', title: 'Pfannkuchen' };

function setup(overrides = {}) {
  const props = {
    recipe,
    onApply: jest.fn().mockResolvedValue(undefined),
    onSkip: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  };
  renderWithProviders(<RecipeVersionDescribe {...props} />);
  return props;
}

const typeText = (value) => fireEvent.change(screen.getByLabelText('Was war anders?'), { target: { value } });

afterEach(() => {
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
});

test('sendet die getrimmte Beschreibung ab', async () => {
  const props = setup();
  const submit = screen.getByRole('button', { name: 'Änderungen einarbeiten' });
  expect(submit).toBeDisabled();
  typeText('  Olivenöl statt Butter  ');
  fireEvent.click(submit);
  await waitFor(() => expect(props.onApply).toHaveBeenCalledWith('Olivenöl statt Butter'));
});

test('zeigt Fehler an und lässt erneut senden oder überspringen', async () => {
  const props = setup({ onApply: jest.fn().mockRejectedValue(new Error('Tageslimit erreicht')) });
  typeText('Olivenöl statt Butter');
  fireEvent.click(screen.getByRole('button', { name: 'Änderungen einarbeiten' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Tageslimit erreicht');
  expect(screen.getByRole('button', { name: 'Änderungen einarbeiten' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Ohne Beschreibung weiter' }));
  expect(props.onSkip).toHaveBeenCalled();
});

test('Abbrechen ruft onCancel', () => {
  const props = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
  expect(props.onCancel).toHaveBeenCalled();
});

test('ohne Spracherkennung gibt es keinen Diktier-Button', () => {
  setup();
  expect(screen.queryByRole('button', { name: /Diktat/ })).not.toBeInTheDocument();
});

test('Diktat hängt erkannten Text an das Textfeld an', () => {
  let instance;
  window.SpeechRecognition = class {
    constructor() { instance = this; }
    start() {}
    stop() { this.onend?.(); }
    abort() {}
  };
  setup();
  typeText('Ich habe');
  fireEvent.click(screen.getByRole('button', { name: 'Diktat starten' }));
  const { act } = require('@testing-library/react');
  act(() => {
    instance.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'Olivenöl genommen' }], { isFinal: true })] });
  });
  expect(screen.getByLabelText('Was war anders?')).toHaveValue('Ich habe Olivenöl genommen');
  fireEvent.click(screen.getByRole('button', { name: 'Diktat beenden' }));
  expect(screen.getByRole('button', { name: 'Diktat starten' })).toBeInTheDocument();
});
