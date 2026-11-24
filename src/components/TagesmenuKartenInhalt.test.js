import React from 'react';
import { render, screen } from '@testing-library/react';
import TagesmenuKartenInhalt from './TagesmenuKartenInhalt';
import useRezeptInhalt from '../hooks/useRezeptInhalt';

jest.mock('../hooks/useRezeptInhalt');

const t = (schluessel) => ({ zutaten: 'Ingredients', zubereitung: 'Preparation' }[schluessel]);
const rezept = {
  id: 'r1',
  ingredients: ['320 g Risottoreis', { type: 'heading', text: 'Topping' }],
  steps: ['Zwiebeln anschwitzen'],
};

describe('TagesmenuKartenInhalt', () => {
  it('zeigt die Übersetzung, wenn eine vorliegt', () => {
    useRezeptInhalt.mockReturnValue({
      zutaten: ['320 g risotto rice', { type: 'heading', text: 'Garnish' }],
      schritte: ['Sweat the onions'],
    });
    render(<TagesmenuKartenInhalt recipe={rezept} recipes={[]} t={t} />);
    expect(screen.getByText('320 g risotto rice')).toBeInTheDocument();
    expect(screen.getByText('Garnish')).toBeInTheDocument();
    expect(screen.getByText('Sweat the onions')).toBeInTheDocument();
    expect(screen.queryByText('320 g Risottoreis')).not.toBeInTheDocument();
  });

  it('zeigt das Original ohne Übersetzung', () => {
    useRezeptInhalt.mockReturnValue(null);
    render(<TagesmenuKartenInhalt recipe={rezept} recipes={[]} t={t} />);
    expect(screen.getByText('320 g Risottoreis')).toBeInTheDocument();
    expect(screen.getByText('Zwiebeln anschwitzen')).toBeInTheDocument();
  });
});
