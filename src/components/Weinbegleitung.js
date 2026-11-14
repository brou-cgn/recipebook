import React, { useId, useState } from 'react';
import { WeinGlas, Gruende, sichereId } from './WeinbegleitungTeile';
import { getStil, formatTemperatur, beispieleKurz } from '../utils/weinbegleitung/wissensbasis';
import {
  MODUS_PRO_GANG,
  MODUS_EIN_WEIN,
  HINWEIS_KEIN_STIL,
  HINWEIS_OHNE_PROFIL,
  HINWEIS_KEIN_GEMEINSAMER_STIL,
  LABEL_BEDINGT,
} from '../utils/weinbegleitung/konstanten';
import { weinfarbe, TEXT_KEIN_STIL } from '../utils/weinbegleitung/anzeige';
import { snapshotZaehler } from '../utils/weinbegleitung/menue';
import './Weinbegleitung.css';

/**
 * Weinbegleitung im Menü-Detail (Variante B, Tracker docs/vorhaben/weinbegleitung.md).
 * Zustand und Aktionen kommen aus useMenueWeinbegleitung (Prop `wein`).
 * - WeinbegleitungUebersicht: Zusammenfassung vor dem ersten Gang mit Umschalter
 *   „Pro Gang“ / „Ein Wein für alles“, „Weinbegleitung erstellen“ bzw. „Neu berechnen“.
 * - WeinbegleitungGang: direkt unter der Gang-Überschrift die Empfehlung und je eine Rot-
 *   und Weißwein-Option, offen sichtbar, jede mit drei Rebsorten; aufklappbar mit Gründen
 *   (ohne Quellen, wie im Rezept-Sheet). Bearbeiter legen eine Option als Empfehlung fest.
 * Leser und Freigabe-Seiten sehen nur Ergebnisse, ohne Knöpfe.
 */

// Rebsorten-Beispiele je Weinoption im Menü (Eigentümer, 14.11.2026)
const MENUE_BEISPIELE_JE_STIL = 3;

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

function HinweisZeile({ gang, mitOptionen }) {
  if (gang.hinweis === HINWEIS_KEIN_STIL) {
    return (
      <p className="weinbegleitung-gang-hinweis">
        {TEXT_KEIN_STIL}.{mitOptionen && ' Wer trotzdem Wein möchte:'}
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

/**
 * Eine Weinoption eines Gangs: Stil mit Glas, drei Rebsorten, Temperatur und Label.
 * Antippen klappt „Warum passt das?“ auf (ohne Quellen); Bearbeiter legen dort eine Option
 * als Empfehlung fest (tauscht und fixiert) oder lösen eine Fixierung.
 */
function OptionZeile({ wein, gang, eintrag, offen, onUmschalten, darfTauschen }) {
  const panelId = sichereId('weinbegleitung-option', useId());
  const stil = getStil(eintrag.stilId);
  const bedingt = eintrag.label === LABEL_BEDINGT;
  return (
    <li className={`weinbegleitung-option${eintrag.istEmpfehlung ? ' weinbegleitung-option--empfehlung' : ''}`}>
      <button
        type="button"
        className="weinbegleitung-gang-zeile"
        aria-expanded={offen}
        aria-controls={panelId}
        onClick={onUmschalten}
      >
        <WeinGlas farbe={weinfarbe(stil)} groesse={22} />
        <span className="weinbegleitung-gang-text">
          <span className="weinbegleitung-gang-name">{stil.name}</span>
          <span className="weinbegleitung-gang-details">
            {beispieleKurz(stil, MENUE_BEISPIELE_JE_STIL).join(', ')} · <span className="weinbegleitung-nowrap">{formatTemperatur(stil)}</span>
          </span>
          <span className={`weinbegleitung-gang-label${bedingt ? ' weinbegleitung-gang-label--bedingt' : ''}`}>
            {eintrag.istEmpfehlung && 'Empfehlung · '}
            {eintrag.label}
            {eintrag.istEmpfehlung && gang.fixiert && <span className="weinbegleitung-fixiert"> · fixiert</span>}
          </span>
        </span>
        <Pfeil offen={offen} />
      </button>

      {offen && (
        <div className="weinbegleitung-gang-panel" id={panelId}>
          <h3 className="weinbegleitung-abschnitt">Warum passt das?</h3>
          {bedingt && (
            <p className="weinbegleitung-bedingt">Die beste Wahl in dieser Farbe, aber kein idealer Partner für diesen Gang.</p>
          )}
          <Gruende regelIds={eintrag.regelIds} mitQuellen={false} />
          {!eintrag.istEmpfehlung && darfTauschen && (
            <button
              type="button"
              className="weinbegleitung-link"
              aria-label={`„${stil.name}“ als Empfehlung festlegen`}
              onClick={() => wein.alternativeWaehlen(gang, eintrag.stilId)}
            >
              Als Empfehlung festlegen
            </button>
          )}
          {eintrag.istEmpfehlung && gang.fixiert && wein.darfBearbeiten && !wein.arbeit && (
            <button type="button" className="weinbegleitung-link" onClick={() => wein.fixierungLoesen(gang)}>
              Fixierung lösen
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Weine eines Gangs unter der Gang-Überschrift: die Empfehlung und je eine Rot- und
 * Weißwein-Option (Snapshot-Feld `optionen`), offen sichtbar. Gänge ohne Empfehlung zeigen
 * den Hinweis und, wo vorhanden, die Optionen.
 */
export function WeinbegleitungGang({ wein, sektionIndex, sektionName }) {
  const [offenesStil, setOffenesStil] = useState(null);
  if (!wein?.snapshot) return null;
  const gang = wein.gangFuer(sektionIndex, sektionName);
  if (!gang) return null;

  const darfTauschen = wein.darfBearbeiten && !wein.arbeit
    && !(wein.snapshot.modus === MODUS_EIN_WEIN && gang.istDessert);
  const eintraege = [
    ...(gang.stilId && getStil(gang.stilId)
      ? [{ stilId: gang.stilId, label: gang.label, regelIds: gang.regelIds, istEmpfehlung: true }]
      : []),
    ...(gang.optionen || [])
      .filter((option) => option.stilId !== gang.stilId && getStil(option.stilId))
      .map((option) => ({ ...option, istEmpfehlung: false })),
  ];
  const hinweis = gang.stilId ? null : <HinweisZeile gang={gang} mitOptionen={eintraege.length > 0} />;
  if (eintraege.length === 0) return hinweis;

  return (
    <div className="weinbegleitung-gang">
      {hinweis}
      <ul className="weinbegleitung-optionen" aria-label={`Weine zu ${sektionName}`}>
        {eintraege.map((eintrag) => (
          <OptionZeile
            key={eintrag.stilId}
            wein={wein}
            gang={gang}
            eintrag={eintrag}
            offen={offenesStil === eintrag.stilId}
            onUmschalten={() => setOffenesStil((vorher) => (vorher === eintrag.stilId ? null : eintrag.stilId))}
            darfTauschen={darfTauschen}
          />
        ))}
      </ul>
    </div>
  );
}
