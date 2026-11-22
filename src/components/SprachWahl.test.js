import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { SpracheProvider } from '../contexts/SpracheContext';
import SprachWahl from './SprachWahl';
import { FLAGGEN_SPRACHEN } from './icons/FlaggeIcon';
import { SPRACH_IDS } from '../i18n/sprachen';

const zeige = ({ profilSprache = null, alsSheet = false, onOffenChange } = {}) => render(
  <SpracheProvider profilSprache={profilSprache} speicher={null}>
    <SprachWahl alsSheet={alsSheet} onOffenChange={onOffenChange} />
  </SpracheProvider>
);

const chip = () => screen.getByRole('button', { name: /Sprache wählen|Choose language|Choisir la langue/ });

describe('SprachWahl – Chip', () => {
  test('zeigt Flagge und Kürzel der geltenden Sprache', () => {
    const { container } = zeige();
    expect(chip()).toHaveAccessibleName('Sprache wählen (aktuell: Deutsch)');
    expect(chip()).toHaveAttribute('aria-expanded', 'false');
    expect(chip()).toHaveTextContent('DE');
    expect(container.querySelector('.sprachwahl-chip .flagge')).toHaveAttribute('data-sprache', 'de');
    expect(chip()).not.toHaveClass('sprachwahl-chip--uebersteuert');
  });

  test('für jede Sprache der App gibt es eine Flagge', () => {
    expect([...FLAGGEN_SPRACHEN].sort()).toEqual([...SPRACH_IDS].sort());
  });
});

describe('SprachWahl – Popover (Desktop)', () => {
  test('öffnet die Auswahl mit der geltenden Sprache im Fokus', () => {
    const onOffenChange = jest.fn();
    zeige({ onOffenChange });
    fireEvent.click(chip());
    const gruppe = screen.getByRole('group', { name: 'Sprache' });
    const deutsch = within(gruppe).getByRole('button', { name: 'Deutsch' });
    expect(deutsch).toHaveAttribute('aria-pressed', 'true');
    expect(deutsch).toHaveFocus();
    expect(within(gruppe).getByRole('button', { name: 'Français' })).toHaveAttribute('lang', 'fr');
    expect(chip()).toHaveAttribute('aria-expanded', 'true');
    expect(onOffenChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByText(/Gilt nur für diese Sitzung/)).not.toBeInTheDocument();
  });

  test('nennt jede Sprache auch in der geltenden Sprache und markiert die Standardsprache', () => {
    zeige();
    fireEvent.click(chip());
    const gruppe = screen.getByRole('group', { name: 'Sprache' });
    expect(within(gruppe).getByRole('button', { name: 'English' })).toHaveAccessibleDescription('Englisch');
    expect(within(gruppe).getByRole('button', { name: 'Français' })).toHaveAccessibleDescription('Französisch');
    expect(within(gruppe).getByRole('button', { name: 'Deutsch' })).toHaveAccessibleDescription('Deine Standardsprache');
  });

  test('übersteuert die Sprache für die Sitzung: Chip, Texte und Hinweis wechseln', () => {
    zeige();
    fireEvent.click(chip());
    fireEvent.click(within(screen.getByRole('group', { name: 'Sprache' })).getByRole('button', { name: 'English' }));

    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(chip()).toHaveAccessibleName('Choose language (current: English)');
    expect(chip()).toHaveTextContent('EN');
    expect(chip()).toHaveClass('sprachwahl-chip--uebersteuert');
    expect(chip()).toHaveFocus();

    fireEvent.click(chip());
    const gruppe = screen.getByRole('group', { name: 'Language' });
    expect(within(gruppe).getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(gruppe).getByRole('button', { name: 'Deutsch' })).toHaveAccessibleDescription('German · Your default language');
    expect(within(gruppe).getByText('For this session only. Your default language: Deutsch')).toBeInTheDocument();
  });

  test('die eigene Standardsprache hebt die Übersteuerung wieder auf', () => {
    zeige({ profilSprache: 'fr' });
    fireEvent.click(chip());
    fireEvent.click(within(screen.getByRole('group', { name: 'Langue' })).getByRole('button', { name: 'English' }));
    expect(chip()).toHaveClass('sprachwahl-chip--uebersteuert');

    fireEvent.click(chip());
    fireEvent.click(within(screen.getByRole('group', { name: 'Language' })).getByRole('button', { name: 'Français' }));
    expect(chip()).not.toHaveClass('sprachwahl-chip--uebersteuert');
    expect(chip()).toHaveTextContent('FR');
    fireEvent.click(chip());
    expect(screen.queryByText(/session/)).not.toBeInTheDocument();
  });

  test('Escape schließt und gibt den Fokus an den Chip zurück', () => {
    zeige();
    fireEvent.click(chip());
    fireEvent.keyDown(screen.getByRole('button', { name: 'Deutsch' }), { key: 'Escape' });
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(chip()).toHaveFocus();
  });

  test('ein Klick außerhalb schließt', () => {
    zeige();
    fireEvent.click(chip());
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });
});

describe('SprachWahl – Bottom Sheet (Handy)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('öffnet einen Dialog über der Seite und sperrt das Scrollen dahinter', () => {
    zeige({ alsSheet: true });
    expect(chip()).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(chip());
    const dialog = screen.getByRole('dialog', { name: 'Sprache' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(document.body).toContainElement(dialog);
    expect(document.body.style.overflow).toBe('hidden');
    expect(within(dialog).getByRole('button', { name: 'Deutsch' })).toHaveFocus();
  });

  test('wählt eine Sprache und schließt', () => {
    zeige({ alsSheet: true });
    fireEvent.click(chip());
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Français' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(chip()).toHaveAccessibleName(/^Choisir la langue/);
    expect(document.body.style.overflow).toBe('');
  });

  test('Schließen-Knopf und Escape schließen nach dem Ausblenden', () => {
    zeige({ alsSheet: true });
    fireEvent.click(chip());
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Schließen' })[0]);
    act(() => { jest.advanceTimersByTime(300); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(chip()).toHaveFocus();

    fireEvent.click(chip());
    fireEvent.keyDown(screen.getByRole('button', { name: 'Deutsch' }), { key: 'Escape' });
    act(() => { jest.advanceTimersByTime(300); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('zeigt den Hinweis zur Sitzung', () => {
    zeige({ alsSheet: true, profilSprache: 'de' });
    fireEvent.click(chip());
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'English' }));
    fireEvent.click(chip());
    expect(within(screen.getByRole('dialog', { name: 'Language' }))
      .getByText('For this session only. Your default language: Deutsch')).toBeInTheDocument();
  });
});
