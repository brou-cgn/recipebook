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
  expect(screen.queryByRole('button', { name: 'Änderungen einarbeiten' })).not.toBeInTheDocument();
  typeText('  Olivenöl statt Butter  ');
  fireEvent.click(screen.getByRole('button', { name: 'Änderungen einarbeiten' }));
  await waitFor(() => expect(props.onApply).toHaveBeenCalledWith('Olivenöl statt Butter'));
});

test('zeigt Fehler an und lässt erneut senden oder überspringen', async () => {
  const props = setup({ onApply: jest.fn().mockRejectedValue(new Error('Tageslimit erreicht')) });
  typeText('Olivenöl statt Butter');
  fireEvent.click(screen.getByRole('button', { name: 'Änderungen einarbeiten' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Tageslimit erreicht');
  expect(screen.getByRole('button', { name: 'Änderungen einarbeiten' })).toBeEnabled();
  typeText('');
  fireEvent.click(screen.getByRole('button', { name: 'Ohne Beschreibung weiter' }));
  expect(props.onSkip).toHaveBeenCalled();
});

test('ohne Text überspringt der Pfeil, mit Text sendet er', () => {
  const props = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Ohne Beschreibung weiter' }));
  expect(props.onSkip).toHaveBeenCalledTimes(1);
  typeText('Mehr Salz');
  expect(screen.queryByRole('button', { name: 'Ohne Beschreibung weiter' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Änderungen einarbeiten' })).toBeEnabled();
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
