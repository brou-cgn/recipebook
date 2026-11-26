import React from 'react';
import { render } from '@testing-library/react';
import { WeinGlas, VorlageGlas } from './WeinbegleitungTeile';

describe('WeinGlas im Ladezustand', () => {
  it('zeigt die Ladeanimation mit Pegel, Welle und maskiertem Glas', () => {
    const { container } = render(<WeinGlas laedt groesse={24} />);
    const svg = container.querySelector('svg.wein-glas.wein-glas--laedt');
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.getAttribute('height')).toBe('24');
    expect(svg.querySelector('.wein-laden-pegel .wein-laden-welle')).not.toBeNull();
    const maske = svg.querySelector('mask');
    expect(svg.querySelector('.wein-laden-glas').getAttribute('mask')).toBe(`url(#${maske.id})`);
  });

  it('vergibt je Glas eigene IDs für Maske und Clip', () => {
    const { container } = render(<><WeinGlas laedt /><WeinGlas laedt /></>);
    const ids = [...container.querySelectorAll('mask, clipPath')].map((el) => el.id);
    expect(new Set(ids).size).toBe(4);
  });

  it('bleibt ohne laedt das ruhende Glas ohne Animation', () => {
    const { container } = render(<WeinGlas farbe="rot" />);
    expect(container.querySelector('.wein-glas--laedt')).toBeNull();
    expect(container.querySelector('.wein-laden-pegel')).toBeNull();
    expect(container.querySelector('.wein-glas-fuellung--rot')).not.toBeNull();
  });

  it('zeigt das Vorlage-Glas ruhend voll oder leer, ohne Animation', () => {
    const { container: voll } = render(<VorlageGlas zustand="voll" />);
    expect(voll.querySelector('svg.wein-glas--voll .wein-laden-welle')).not.toBeNull();
    expect(voll.querySelector('.wein-glas--laedt')).toBeNull();
    const { container: leer } = render(<VorlageGlas zustand="leer" />);
    expect(leer.querySelector('svg.wein-glas--leer')).not.toBeNull();
    expect(leer.querySelector('.wein-laden-welle')).toBeNull();
  });
});
