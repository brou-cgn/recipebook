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
  typeText('  Olivenöl statt Butter  ');
  fireEvent.click(screen.getByRole('button', { name: 'Version erstellen' }));
  await waitFor(() => expect(props.onApply).toHaveBeenCalledWith('Olivenöl statt Butter'));
});

test('zeigt Fehler an und lässt erneut senden oder überspringen', async () => {
  const props = setup({ onApply: jest.fn().mockRejectedValue(new Error('Tageslimit erreicht')) });
  typeText('Olivenöl statt Butter');
  fireEvent.click(screen.getByRole('button', { name: 'Version erstellen' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Tageslimit erreicht');
  expect(screen.getByRole('button', { name: 'Version erstellen' })).toBeEnabled();
  typeText('');
  fireEvent.click(screen.getByRole('button', { name: 'Version erstellen' }));
  expect(props.onSkip).toHaveBeenCalled();
});

test('Weiter-Aktion für den Versionsbutton: ohne Text überspringen, mit Text einarbeiten', async () => {
  const continueRef = { current: null };
  const props = setup({ continueRef });
  continueRef.current();
  expect(props.onSkip).toHaveBeenCalledTimes(1);
  typeText('Mehr Salz');
  continueRef.current();
  await waitFor(() => expect(props.onApply).toHaveBeenCalledWith('Mehr Salz'));
  expect(props.onSkip).toHaveBeenCalledTimes(1);
});

test('mit Versionsbutton (schmales Fenster) gibt es keinen eigenen Weiter-Button', () => {
  const original = window.innerWidth;
  window.innerWidth = 400;
  try {
    setup();
    expect(screen.queryByRole('button', { name: 'Version erstellen' })).not.toBeInTheDocument();
  } finally {
    window.innerWidth = original;
  }
});

test('Klick neben die Pille ruft onCancel, Klick in die Pille nicht', () => {
  const props = setup();
  fireEvent.click(screen.getByLabelText('Was war anders?'));
  expect(props.onCancel).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('dialog'));
  expect(props.onCancel).toHaveBeenCalledTimes(1);
});

test('Escape ruft onCancel', () => {
  const props = setup();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
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
