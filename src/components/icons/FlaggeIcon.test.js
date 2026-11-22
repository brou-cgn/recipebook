import React from 'react';
import fs from 'fs';
import path from 'path';
import { render } from '@testing-library/react';
import FlaggeIcon, { FLAGGEN_LINIEN, FLAGGEN_SPRACHEN } from './FlaggeIcon';
import { SPRACH_IDS } from '../../i18n/sprachen';

describe('FlaggeIcon – Fahnen als Umriss', () => {
  test('für jede Sprache der App gibt es eine Fahne', () => {
    expect([...FLAGGEN_SPRACHEN].sort()).toEqual([...SPRACH_IDS].sort());
  });

  test.each(SPRACH_IDS)('%s: Rahmen und Linien, keine Farbflächen', (sprache) => {
    const { container } = render(<FlaggeIcon sprache={sprache} className="test" />);
    const huelle = container.querySelector('span.flagge.test');
    expect(huelle).toHaveAttribute('data-sprache', sprache);
    const svg = huelle.querySelector('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 45 30');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg.querySelector('rect')).toHaveAttribute('width', '45');
    expect(svg.querySelector('path')).toHaveAttribute('d', FLAGGEN_LINIEN[sprache]);
    expect(svg.querySelectorAll('[fill]')).toHaveLength(0);
  });

  test.each(SPRACH_IDS)('%s: alle Linien liegen im Rahmen 45 x 30', (sprache) => {
    const zahlen = FLAGGEN_LINIEN[sprache].match(/-?\d+(\.\d+)?/g).map(Number);
    zahlen.forEach((zahl) => {
      expect(zahl).toBeGreaterThanOrEqual(0);
      expect(zahl).toBeLessThanOrEqual(45);
    });
  });

  test('unbekannte Sprache: leere Hülle', () => {
    const { container } = render(<FlaggeIcon sprache="es" />);
    expect(container.querySelector('span.flagge svg')).toBeNull();
  });

  test('die Linien haben die Textfarbe und sind in jeder Größe gleich stark', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'SprachWahl.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const regel = css.match(/\.flagge rect,\s*\.flagge path\s*\{([^}]*)\}/);
    expect(regel).not.toBeNull();
    expect(regel[1]).toMatch(/fill:\s*none/);
    expect(regel[1]).toMatch(/stroke:\s*var\(--color-text-strong\)/);
    expect(regel[1]).toMatch(/vector-effect:\s*non-scaling-stroke/);
  });
});
