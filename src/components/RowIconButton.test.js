/**
 * RowIconButton: neutraler Symbol-Knopf in Listenzeilen (Umbenennen, Bearbeiten, Verschieben), Gegenstück zum
 * DeleteRowButton (Tech-Check A8).
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen } from '@testing-library/react';
import RowIconButton from './RowIconButton';

test('Name aus label als Tooltip und aria-label, kein Absenden von Formularen', () => {
  const onClick = jest.fn();
  render(
    <form onSubmit={(e) => { e.preventDefault(); throw new Error('abgeschickt'); }}>
      <RowIconButton label="Deutsche Küche umbenennen" onClick={onClick}><svg /></RowIconButton>
    </form>
  );
  const knopf = screen.getByRole('button', { name: 'Deutsche Küche umbenennen' });
  expect(knopf).toHaveAttribute('title', 'Deutsche Küche umbenennen');
  expect(knopf).toHaveAttribute('type', 'button');
  fireEvent.click(knopf);
  expect(onClick).toHaveBeenCalledTimes(1);
});

test('reicht disabled und className durch', () => {
  render(<RowIconButton label="Nach oben" disabled className="faq-move"><svg /></RowIconButton>);
  const knopf = screen.getByRole('button', { name: 'Nach oben' });
  expect(knopf).toBeDisabled();
  expect(knopf).toHaveClass('row-icon-button', 'faq-move');
});

test('gestaltet nur über Tokens: keine Hex-Farben, keine eigenen Dunkel-Regeln', () => {
  const css = fs.readFileSync(path.join(__dirname, 'RowIconButton.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  expect(css).not.toMatch(/data-theme/);
});
