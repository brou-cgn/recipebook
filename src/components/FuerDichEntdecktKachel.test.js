import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FuerDichEntdecktKachel from './FuerDichEntdecktKachel';

const list = { id: 'fuerDichEntdeckt_u1', name: 'Für dich entdeckt', description: '' };

describe('FuerDichEntdecktKachel', () => {
  test('rendert ohne Liste nichts', () => {
    const { container } = render(<FuerDichEntdecktKachel list={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('zeigt bei leerer Liste einen Hinweis und keinen Einstieg', () => {
    const onOpen = jest.fn();
    render(<FuerDichEntdecktKachel list={list} recipes={[]} onOpen={onOpen} />);
    expect(screen.getByRole('heading', { name: 'Für dich entdeckt' })).toBeInTheDocument();
    expect(screen.getByText('Hier tauchen bald Rezepte zu wechselnden Themen auf.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('öffnet mit Rezepten den Swipestapel der Liste', () => {
    const onOpen = jest.fn();
    const recipes = [
      { id: 'r1', title: 'Kürbis-Curry', images: [{ url: 'a.jpg', isDefault: true }] },
      { id: 'r2', title: 'Zwiebelkuchen', image: 'b.jpg' },
    ];
    render(<FuerDichEntdecktKachel list={{ ...list, description: 'Letztes Jahr im Oktober' }} recipes={recipes} onOpen={onOpen} />);

    const card = screen.getByRole('button', { name: 'Letztes Jahr im Oktober, 2 Rezepte – Swipestapel öffnen' });
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledWith('fuerDichEntdeckt_u1');
  });

  test('zeigt höchstens drei Bilder in der Collage', () => {
    const recipes = ['1', '2', '3', '4'].map((id) => ({ id, title: id, image: `${id}.jpg` }));
    const { container } = render(<FuerDichEntdecktKachel list={list} recipes={recipes} />);
    expect(container.querySelectorAll('.fuer-dich-entdeckt-collage-cell')).toHaveLength(3);
    expect(screen.getByText('4 Rezepte')).toBeInTheDocument();
  });
});
