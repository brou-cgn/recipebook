import React, { useMemo } from 'react';
import './HandschriftText.css';
import { handschriftFaktor, handschriftWoerter } from '../utils/handschrift';

/**
 * Zeigt einen kurzen Text wie von Hand geschrieben (src/utils/handschrift.js): jedes Zeichen
 * leicht anders gedreht, verschoben und skaliert. Schrift und Größe setzt der Aufrufer per CSS;
 * `--handschrift-faktor` (1 oder kleiner) erlaubt ihm, lange Texte zu verkleinern.
 *
 * Screenreader lesen den Text einmal am Stück; die einzelnen Zeichen sind für sie verborgen.
 * Umbrochen wird nur zwischen Wörtern.
 */
function HandschriftText({ text, className = '', as: Element = 'p' }) {
  const woerter = useMemo(() => handschriftWoerter(text), [text]);
  if (woerter.length === 0) return null;
  return (
    <Element
      className={`handschrift-text ${className}`.trim()}
      style={{ '--handschrift-faktor': handschriftFaktor(text) }}
    >
      <span className="handschrift-text__vorlesen">{text}</span>
      <span className="handschrift-text__bild" aria-hidden="true">
        {woerter.map((wort, wortIndex) => (
          <React.Fragment key={wortIndex}>
            {wortIndex > 0 && ' '}
            <span className="handschrift-text__wort">
              {wort.map((teil, zeichenIndex) => (
                <span
                  key={zeichenIndex}
                  className="handschrift-text__zeichen"
                  style={{ transform: teil.transform, opacity: teil.deckkraft }}
                >
                  {teil.zeichen}
                </span>
              ))}
            </span>
          </React.Fragment>
        ))}
      </span>
    </Element>
  );
}

export default HandschriftText;
