import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import Button, { BUTTON_VARIANTS } from './Button';

describe('Button (Button-System, Tech-Check A8)', () => {
  it('ist standardmäßig ein Neben-Knopf vom Typ button', () => {
    renderWithProviders(<Button>Abbrechen</Button>);
    const button = screen.getByRole('button', { name: 'Abbrechen' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('ui-button', 'ui-button--secondary');
  });

  it('kennt genau die fünf Rollen und fällt bei Unbekanntem auf den Neben-Knopf zurück', () => {
    expect(BUTTON_VARIANTS).toEqual(['primary', 'secondary', 'danger', 'danger-quiet', 'ghost']);
    renderWithProviders(
      <>
        {BUTTON_VARIANTS.map((v) => <Button key={v} variant={v}>{v}</Button>)}
        <Button variant="lila">unbekannt</Button>
      </>
    );
    BUTTON_VARIANTS.forEach((v) => expect(screen.getByRole('button', { name: v })).toHaveClass(`ui-button--${v}`));
    expect(screen.getByRole('button', { name: 'unbekannt' })).toHaveClass('ui-button--secondary');
  });

  it('sperrt den Knopf beim Laden, setzt aria-busy und löst keinen Klick aus', () => {
    const onClick = jest.fn();
    renderWithProviders(<Button variant="primary" loading onClick={onClick}>Speichert …</Button>);
    const button = screen.getByRole('button', { name: 'Speichert …' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('.ui-button__spinner')).not.toBeNull();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('reicht type, fullWidth, eigene Klassen und weitere Attribute durch', () => {
    const ref = React.createRef();
    renderWithProviders(
      <Button ref={ref} variant="primary" type="submit" fullWidth className="extra" aria-label="Anmelden" data-x="1">Los</Button>
    );
    const button = screen.getByRole('button', { name: 'Anmelden' });
    expect(button).toHaveAttribute('type', 'submit');
    expect(button).toHaveClass('ui-button--full', 'extra');
    expect(button).toHaveAttribute('data-x', '1');
    expect(ref.current).toBe(button);
  });

  it('zeigt ein Icon vor dem Text', () => {
    renderWithProviders(<Button icon={<svg data-testid="icon" />} variant="danger-quiet">Rezept löschen</Button>);
    const button = screen.getByRole('button', { name: 'Rezept löschen' });
    expect(button.firstChild).toBe(screen.getByTestId('icon'));
  });
});
