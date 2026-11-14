import React, { useState } from 'react';
import { WeinGlas, Gruende, Quellen } from './WeinbegleitungTeile';
import { getStil, formatTemperatur, beispieleKurz } from '../utils/weinbegleitung/wissensbasis';
import {
  MODUS_PRO_GANG,
  MODUS_EIN_WEIN,
  HINWEIS_KEIN_STIL,
  HINWEIS_OHNE_PROFIL,
  HINWEIS_KEIN_GEMEINSAMER_STIL,
} from '../utils/weinbegleitung/konstanten';
import { weinfarbe, TEXT_KEIN_STIL } from '../utils/weinbegleitung/anzeige';
import { snapshotZaehler } from '../utils/weinbegleitung/menue';
import './Weinbegleitung.css';

/**
 * Weinbegleitung im Menü-Detail (Variante B, Tracker docs/vorhaben/weinbegleitung.md).
 * Zustand und Aktionen kommen aus useMenueWeinbegleitung (Prop `wein`).
 * - WeinbegleitungUebersicht: Zusammenfassung vor dem ersten Gang mit Umschalter
 *   „Pro Gang“ / „Ein Wein für alles“, „Weinbegleitung erstellen“ bzw. „Neu berechnen“.
 * - WeinbegleitungGang: Weinzeile direkt unter der Gang-Überschrift, aufklappbar mit
 *   Gründen, Quellen und Alternativen (tauschen und fixieren nur für Bearbeiter).
 * Leser und Freigabe-Seiten sehen nur Ergebnisse, ohne Knöpfe.
 */

const MODI = [
  { modus: MODUS_PRO_GANG, text: 'Pro Gang' },
  { modus: MODUS_EIN_WEIN, text: 'Ein Wein für alles' },
];

function zusammenfassung(snapshot) {
  if (!snapshot) return 'Passende Weinstile zu jedem Gang, mit Begründung.';
  if (snapshot.modus === MODUS_EIN_WEIN) {
    const stil = getStil(snapshot.gemeinsamerStilId);
    return stil ? `Ein Wein für alles: ${stil.name}` : 'Kein Stil passt zu allen Gängen.';
  }
  const { weine, gaenge } = snapshotZaehler(snapshot);
  return `${weine} ${weine === 1 ? 'Wein' : 'Weine'} für ${gaenge} ${gaenge === 1 ? 'Gang' : 'Gänge'}`;
}

function arbeitText(arbeit) {
  if (arbeit?.art === 'schaetzen') {
    return `Gerichte werden eingeschätzt (${arbeit.fertig} von ${arbeit.gesamt}) …`;
  }
  return 'Weinbegleitung wird berechnet …';
}

export function WeinbegleitungUebersicht({ wein }) {
  if (!wein?.sichtbar) return null;
  const { snapshot, darfBearbeiten, arbeit, fehler, hinweis, veraltet } = wein;
  const modusText = MODI.find((eintrag) => eintrag.modus === snapshot?.modus)?.text;

  return (
    <section className="weinbegleitung-uebersicht" aria-label="Weinbegleitung">
      <div className="weinbegleitung-kopf">
        <WeinGlas farbe={snapshot ? 'rot' : null} laedt={Boolean(arbeit)} groesse={24} />
        <div className="weinbegleitung-kopf-text">
          <h2 className="weinbegleitung-titel">Weinbegleitung</h2>
          <p className="weinbegleitung-zusammenfassung">{zusammenfassung(snapshot)}</p>
        </div>
        {snapshot && !darfBearbeiten && modusText && (
          <span className="weinbegleitung-modus">{modusText}</span>
        )}
      </div>

      {snapshot && darfBearbeiten && (
        <div className="weinbegleitung-umschalter" role="group" aria-label="Art der Weinbegleitung">
          {MODI.map((eintrag) => (
            <button
              key={eintrag.modus}
              type="button"
              className="weinbegleitung-umschalter-knopf"
              aria-pressed={snapshot.modus === eintrag.modus}
              disabled={Boolean(arbeit)}
              onClick={() => wein.modusWechseln(eintrag.modus)}
            >
              {eintrag.text}
            </button>
          ))}
        </div>
      )}

      {arbeit && (
        <p className="weinbegleitung-status" role="status">{arbeitText(arbeit)}</p>
      )}

      {!snapshot && darfBearbeiten && !arbeit && (
        <button type="button" className="weinbegleitung-knopf" onClick={wein.berechnen}>
          Weinbegleitung erstellen
        </button>
      )}

      {snapshot && veraltet && !arbeit && (
        <div className="weinbegleitung-veraltet">
          <p>Menü oder Rezepte wurden seit der Berechnung geändert.</p>
          {darfBearbeiten && (
            <button type="button" className="weinbegleitung-knopf" onClick={wein.berechnen}>
              Neu berechnen
            </button>
          )}
        </div>
      )}

      {fehler && <p className="weinbegleitung-fehler" role="alert">{fehler}</p>}
      {hinweis && <p className="weinbegleitung-hinweis">{hinweis}</p>}
    </section>
  );
}

function HinweisZeile({ gang }) {
  if (gang.hinweis === HINWEIS_KEIN_STIL) {
    return (
      <p className="weinbegleitung-gang-hinweis">
        {TEXT_KEIN_STIL} <Quellen regelId="R11" />
      </p>
    );
  }
  if (gang.hinweis === HINWEIS_KEIN_GEMEINSAMER_STIL) {
    return <p className="weinbegleitung-gang-hinweis">Kein Stil passt zu allen Gängen. Pro Gang passt hier besser.</p>;
  }
  if (gang.hinweis === HINWEIS_OHNE_PROFIL) {
    return <p className="weinbegleitung-gang-hinweis">Noch nicht eingeschätzt.</p>;
  }
  return null;
}

function Pfeil({ offen }) {
  return (
    <svg
      className={`weinbegleitung-pfeil${offen ? ' weinbegleitung-pfeil--offen' : ''}`}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function WeinbegleitungGang({ wein, sektionIndex, sektionName }) {
  const [offen, setOffen] = useState(false);
  if (!wein?.snapshot) return null;
  const gang = wein.gangFuer(sektionIndex, sektionName);
  if (!gang) return null;
  if (!gang.stilId) return <HinweisZeile gang={gang} />;

  const stil = getStil(gang.stilId);
  if (!stil) return null;
  const darfTauschen = wein.darfBearbeiten && !wein.arbeit
    && !(wein.snapshot.modus === MODUS_EIN_WEIN && gang.istDessert);
  const alternativen = (gang.alternativen || []).filter((alternative) => getStil(alternative.stilId));

  return (
    <div className="weinbegleitung-gang">
      <button
        type="button"
        className="weinbegleitung-gang-zeile"
        aria-expanded={offen}
        onClick={() => setOffen((vorher) => !vorher)}
      >
        <WeinGlas farbe={weinfarbe(stil)} groesse={22} />
        <span className="weinbegleitung-gang-text">
          <span className="weinbegleitung-gang-name">{stil.name}</span>
          <span className="weinbegleitung-gang-details">
            {beispieleKurz(stil).join(', ')} · <span className="weinbegleitung-nowrap">{formatTemperatur(stil)}</span>
          </span>
          <span className="weinbegleitung-gang-label">
            {gang.label}
            {gang.fixiert && <span className="weinbegleitung-fixiert"> · fixiert</span>}
          </span>
        </span>
        <Pfeil offen={offen} />
      </button>

      {offen && (
        <div className="weinbegleitung-gang-panel">
          <h3 className="weinbegleitung-abschnitt">Warum passt das?</h3>
          <Gruende regelIds={gang.regelIds} />

          {alternativen.length > 0 && (
            <>
              <h3 className="weinbegleitung-abschnitt">{darfTauschen ? 'Tauschen' : 'Auch passend'}</h3>
              <ul className="weinbegleitung-alternativen">
                {alternativen.map((alternative) => {
                  const alternativStil = getStil(alternative.stilId);
                  return (
                    <li key={alternative.stilId}>
                      {darfTauschen ? (
                        <button
                          type="button"
                          className="weinbegleitung-alternative"
                          aria-label={`Gegen „${alternativStil.name}“ tauschen`}
                          onClick={() => wein.alternativeWaehlen(gang, alternative.stilId)}
                        >
                          <WeinGlas farbe={weinfarbe(alternativStil)} groesse={20} />
                          <span>{alternativStil.name}</span>
                          <span className="weinbegleitung-alternative-label">{alternative.label}</span>
                        </button>
                      ) : (
                        <span className="weinbegleitung-alternative weinbegleitung-alternative--text">
                          <WeinGlas farbe={weinfarbe(alternativStil)} groesse={20} />
                          <span>{alternativStil.name}</span>
                          <span className="weinbegleitung-alternative-label">{alternative.label}</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {gang.fixiert && wein.darfBearbeiten && !wein.arbeit && (
            <button type="button" className="weinbegleitung-link" onClick={() => wein.fixierungLoesen(gang)}>
              Fixierung lösen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
