import React from 'react';
import fs from 'fs';
import path from 'path';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import RecipeVersionDescribe from './RecipeVersionDescribe';
import rezeptansichtTexte, { VERSION_MELDUNGEN } from '../i18n/texte/rezeptansicht';

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
  expect(instance.lang).toBe('de-DE');
  act(() => {
    instance.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'Olivenöl genommen' }], { isFinal: true })] });
  });
  expect(screen.getByLabelText('Was war anders?')).toHaveValue('Ich habe Olivenöl genommen');
  fireEvent.click(screen.getByRole('button', { name: 'Diktat beenden' }));
  expect(screen.getByRole('button', { name: 'Diktat starten' })).toBeInTheDocument();
});

describe('Bearbeiten mit KI (modus „bearbeiten“, Rezeptformular)', () => {
  test('eigene Texte, Weiter ohne Text führt zurück zum Formular', async () => {
    const props = setup({ modus: 'bearbeiten', hasFab: () => false });
    expect(screen.getByRole('dialog', { name: 'Rezept mit KI bearbeiten' })).toBeInTheDocument();
    const feld = screen.getByLabelText('Was soll sich ändern?');
    expect(feld).toHaveAttribute('placeholder', 'Was möchtest du am Rezept ändern?');
    expect(screen.getByRole('button', { name: 'Einarbeiten' })).toHaveAttribute('title', 'Zurück zum Formular');

    fireEvent.click(screen.getByRole('button', { name: 'Einarbeiten' }));
    expect(props.onSkip).toHaveBeenCalledTimes(1);

    fireEvent.change(feld, { target: { value: 'Ersetze Butter durch Olivenöl' } });
    expect(screen.getByRole('button', { name: 'Einarbeiten' })).toHaveAttribute('title', 'Änderungen einarbeiten – danach kannst du alles kontrollieren');
    fireEvent.click(screen.getByRole('button', { name: 'Einarbeiten' }));
    await waitFor(() => expect(props.onApply).toHaveBeenCalledWith('Ersetze Butter durch Olivenöl'));
  });

  test('hasFab entscheidet, ob der runde Button des Aufrufers Weiter übernimmt', () => {
    setup({ modus: 'bearbeiten', hasFab: () => true });
    expect(screen.queryByRole('button', { name: 'Einarbeiten' })).not.toBeInTheDocument();
  });

  test('Englisch und Französisch', () => {
    const { unmount } = renderWithProviders(
      <RecipeVersionDescribe modus="bearbeiten" hasFab={() => false} onApply={jest.fn()} onSkip={jest.fn()} onCancel={jest.fn()} />,
      { sprache: 'en' },
    );
    expect(screen.getByRole('dialog', { name: 'Edit recipe with AI' })).toBeInTheDocument();
    expect(screen.getByLabelText('What should change?')).toHaveAttribute('placeholder', 'What would you like to change in the recipe?');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
    unmount();

    renderWithProviders(
      <RecipeVersionDescribe modus="bearbeiten" hasFab={() => false} onApply={jest.fn()} onSkip={jest.fn()} onCancel={jest.fn()} />,
      { sprache: 'fr' },
    );
    expect(screen.getByRole('dialog', { name: 'Modifier la recette avec l’IA' })).toBeInTheDocument();
    expect(screen.getByLabelText('Que faut-il changer ?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Intégrer' })).toHaveAttribute('title', 'Retour au formulaire');
  });
});

describe('Mehrsprachigkeit (PR 6o)', () => {
  const zeige = (sprache, props = {}) => renderWithProviders(
    <RecipeVersionDescribe recipe={recipe} onApply={jest.fn()} onSkip={jest.fn()} onCancel={jest.fn()} {...props} />,
    { sprache },
  );

  function spracherkennung() {
    const erkennung = {};
    window.SpeechRecognition = class {
      constructor() { erkennung.instanz = this; }
      start() {}
      stop() { this.onend?.(); }
      abort() {}
    };
    return erkennung;
  }

  test('Englisch: Dialog, Diktat-Knopf und bekannte Meldung der Cloud Function', async () => {
    spracherkennung();
    const onApply = jest.fn().mockRejectedValue(
      new Error('Tageslimit für Versionsbeschreibungen erreicht (40/40). Versuche es morgen erneut.'),
    );
    zeige('en', { onApply });
    expect(screen.getByRole('dialog', { name: 'Create your own version' })).toBeInTheDocument();
    const feld = screen.getByLabelText('What was different?');
    expect(feld).toHaveAttribute('placeholder', 'What did you do differently?');
    expect(screen.getByRole('button', { name: 'Start dictation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create version' })).toHaveAttribute('title', 'Continue without a description');

    fireEvent.change(feld, { target: { value: 'Olive oil instead of butter' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create version' }));
    expect(await screen.findByRole('alert'))
      .toHaveTextContent('Daily limit for version descriptions reached (40/40). Try again tomorrow.');
  });

  test('Französisch: die Spracherkennung hört französisch zu, ihre Fehler erscheinen französisch', () => {
    const erkennung = spracherkennung();
    zeige('fr');
    expect(screen.getByLabelText('Qu’est-ce qui était différent ?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la dictée' }));
    expect(erkennung.instanz.lang).toBe('fr-FR');
    expect(screen.getByRole('button', { name: 'Arrêter la dictée' })).toBeInTheDocument();
    act(() => {
      erkennung.instanz.onerror({ error: 'no-speech' });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Rien n’a été compris. Réessaie.');
  });

  test('ohne Meldung kommt der eigene Ersatztext, eine unbekannte Meldung bleibt, wie sie ist', async () => {
    const onApply = jest.fn().mockRejectedValueOnce(new Error('')).mockRejectedValueOnce(new Error('Gemini API error: quota'));
    zeige('fr', { onApply });
    fireEvent.change(screen.getByLabelText('Qu’est-ce qui était différent ?'), { target: { value: 'Plus de sel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer la version' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible d’intégrer les modifications.');
    fireEvent.click(screen.getByRole('button', { name: 'Créer la version' }));
    expect(await screen.findByText('Gemini API error: quota')).toHaveAttribute('role', 'alert');
  });

  test('Englisch: Meldung der KI-Berechtigung (PR 6p)', async () => {
    const onApply = jest.fn().mockRejectedValue(new Error('Deiner Rolle fehlt die Berechtigung für diese Funktion.'));
    zeige('en', { onApply });
    fireEvent.change(screen.getByLabelText('What was different?'), { target: { value: 'More salt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create version' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your role doesn’t have permission for this feature.');
  });

  test('kennt jede Meldung so, wie die Cloud Function sie meldet', () => {
    const quelle = [
      ['handlers', 'versionChanges.js'],
      ['shared', 'auth.js'],
    ].map((teile) => fs.readFileSync(path.join(__dirname, '..', '..', 'functions', ...teile), 'utf8')).join('\n');
    VERSION_MELDUNGEN.forEach((schluessel) => {
      rezeptansichtTexte.de[schluessel].split(/\{\w+\}/).filter((teil) => teil.trim()).forEach((teil) => {
        expect({ schluessel, gefunden: quelle.includes(teil) }).toEqual({ schluessel, gefunden: true });
      });
    });
  });
});
