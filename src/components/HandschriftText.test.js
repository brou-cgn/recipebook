import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import HandschriftText from './HandschriftText';

describe('HandschriftText', () => {
  test('Screenreader bekommen den Text am Stück, die Zeichen sind verborgen', () => {
    const { container } = renderWithProviders(<HandschriftText text="Unsere besten Momente" className="tagline" />);
    const absatz = container.querySelector('p.handschrift-text.tagline');
    expect(absatz).not.toBeNull();
    expect(screen.getByText('Unsere besten Momente')).toHaveClass('handschrift-text__vorlesen');
    expect(container.querySelector('.handschrift-text__bild')).toHaveAttribute('aria-hidden', 'true');
  });

  test('jedes Zeichen hat eine eigene Abweichung, Wörter bleiben zusammen', () => {
    const { container } = renderWithProviders(<HandschriftText text="Unsere besten Momente" />);
    const woerter = container.querySelectorAll('.handschrift-text__wort');
    expect([...woerter].map((wort) => wort.textContent)).toEqual(['Unsere', 'besten', 'Momente']);
    const zeichen = container.querySelectorAll('.handschrift-text__zeichen');
    expect(zeichen).toHaveLength(19);
    expect(zeichen[0].style.transform).toBe('translateY(-0.046em) rotate(3.47deg) scale(1.013)');
    expect(zeichen[0].style.opacity).toBe('0.85');
    expect(container.querySelector('.handschrift-text__bild').textContent).toBe('Unsere besten Momente');
  });

  test('lange Texte setzen einen kleineren Größenfaktor', () => {
    const { container } = renderWithProviders(
      <HandschriftText text="Rezepte, Menüs und Abende mit Familie und Freunden" />
    );
    const faktor = Number(container.firstChild.style.getPropertyValue('--handschrift-faktor'));
    expect(faktor).toBeLessThan(1);
    expect(faktor).toBeGreaterThan(0);
  });

  test('ohne Text wird nichts gezeigt', () => {
    const { container } = renderWithProviders(<HandschriftText text="" />);
    expect(container.firstChild).toBeNull();
  });

  test('anderes Element über as', () => {
    const { container } = renderWithProviders(<HandschriftText text="Our best moments" as="span" />);
    expect(container.firstChild.tagName).toBe('SPAN');
  });
});
