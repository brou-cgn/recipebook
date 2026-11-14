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
import { snapshotZaehler, zeigtEinWeinImKopf } from '../utils/weinbegleitung/menue';
import './Weinbegleitung.css';

/**
 * Weinbegleitung im Menü-Detail (Variante B, Tracker docs/vorhaben/weinbegleitung.md).
 * Zustand und Aktionen kommen aus useMenueWeinbegleitung (Prop `wein`).
 * - WeinbegleitungUebersicht: Zusammenfassung vor dem ersten Gang mit Umschalter
 *   „Pro Gang“ / „Ein Wein für alles“, „Weinbegleitung erstellen“ bzw. „Neu berechnen“.
 *   Im Modus „Ein Wein“ stehen hier je eine Weiß- und eine Rotwein-Option für alle Gänge, mit
 *   dem Gang, zu dem sie am besten passen, und der eigene Wein zum Dessert.
 * - WeinbegleitungGang: im Modus „Pro Gang“ direkt unter der Gang-Überschrift die Empfehlung
 *   und je eine Rot- und Weißwein-Option, offen sichtbar, jede mit drei Rebsorten. Im Modus
 *   „Ein Wein“ steht dort nur noch, was den Gang ausnimmt (kein Wein, noch nicht eingeschätzt).
 * Jede Weinzeile klappt „Warum passt das?“ auf (ohne Quellen, wie im Rezept-Sheet);
 * Bearbeiter legen dort eine Option als Empfehlung fest. Leser und Freigabe-Seiten sehen nur
 * Ergebnisse, ohne Knöpfe.
 */

// Rebsorten-Beispiele je Weinoption im Menü (Eigentümer, 14.11.2026)
const MENUE_BEISPIELE_JE_STIL = 3;

const MODI = [
  { modus: MODUS_PRO_GANG, text: 'Pro Gang' },
  { modus: MODUS_EIN_WEIN, text: 'Ein Wein für alles' },
];

const aufzaehlung = (namen) => (namen.length < 2
  ? namen.join('')
  : `${namen.slice(0, -1).join(', ')} und ${namen[namen.length - 1]}`);

function einWeinZusammenfassung(snapshot) {
  const mitDessert = snapshot.gaenge.some((gang) => gang.istDessert && gang.stilId);
  if (snapshot.einWeinOptionen.length === 0) {
    return mitDessert ? 'Ein eigener Wein zum Dessert.' : 'Kein Stil passt zu allen Gängen.';
  }
  if (!snapshot.gemeinsamerStilId) return 'Kein Weiß- oder Rotwein passt zu allen Gängen. Pro Gang passt hier besser.';
  return mitDessert ? 'Ein Wein für alle Gänge außer dem Dessert: Weiß oder Rot.' : 'Ein Wein für alle Gänge: Weiß oder Rot.';
}

function zusammenfassung(snapshot) {
  if (!snapshot) return 'Passende Weinstile zu jedem Gang, mit Begründung.';
  if (zeigtEinWeinImKopf(snapshot)) return einWeinZusammenfassung(snapshot);
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

      {zeigtEinWeinImKopf(snapshot) && <EinWeinKopf wein={wein} />}

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
 * Eine Weinzeile: Stil mit Glas, drei Rebsorten, Temperatur und Label, darunter optional ein
 * Zusatz („Am besten zu: …“). Antippen klappt den Inhalt (`children`) auf.
 */
function OptionZeile({ stilId, label, istEmpfehlung = false, fixiert = false, zusatz = null, offen, onUmschalten, children }) {
  const panelId = sichereId('weinbegleitung-option', useId());
  const stil = getStil(stilId);
  return (
    <li className={`weinbegleitung-option${istEmpfehlung ? ' weinbegleitung-option--empfehlung' : ''}`}>
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
          <span className={`weinbegleitung-gang-label${label === LABEL_BEDINGT ? ' weinbegleitung-gang-label--bedingt' : ''}`}>
            {istEmpfehlung && 'Empfehlung · '}
            {label}
            {fixiert && <span className="weinbegleitung-fixiert"> · fixiert</span>}
          </span>
          {zusatz && <span className="weinbegleitung-gang-zusatz">{zusatz}</span>}
        </span>
        <Pfeil offen={offen} />
      </button>

      {offen && (
        <div className="weinbegleitung-gang-panel" id={panelId}>
          {children}
        </div>
      )}
    </li>
  );
}

function FestlegenKnopf({ stil, onClick }) {
  return (
    <button
      type="button"
      className="weinbegleitung-link"
      aria-label={`„${stil.name}“ als Empfehlung festlegen`}
      onClick={onClick}
    >
      Als Empfehlung festlegen
    </button>
  );
}

function LoesenKnopf({ onClick }) {
  return (
    <button type="button" className="weinbegleitung-link" onClick={onClick}>
      Fixierung lösen
    </button>
  );
}

function amBestenZu(option) {
  const beste = (option.besteGaenge || []).map((gang) => gang.sektionName).filter(Boolean);
  if (beste.length === 0 || beste.length >= (option.gaenge || []).length) return null;
  return `Am besten zu: ${aufzaehlung(beste)}`;
}

/**
 * Modus „Ein Wein für alles“ im Kopf: je eine Weiß- und eine Rotwein-Option für alle Gänge
 * (Empfehlung zuerst) mit dem Gang, zu dem sie am besten passt; aufgeklappt Label und Gründe
 * je Gang. Darunter der eigene Wein jedes Dessert-Gangs.
 */
function EinWeinKopf({ wein }) {
  const [offen, setOffen] = useState(null);
  const { snapshot } = wein;
  const umschalten = (schluessel) => setOffen((vorher) => (vorher === schluessel ? null : schluessel));
  const darfAendern = wein.darfBearbeiten && !wein.arbeit;
  const fixiert = Boolean(snapshot.gemeinsamerStilId)
    && snapshot.gemeinsamerStilId === snapshot.gewaehlterGemeinsamerStilId;
  const optionen = snapshot.einWeinOptionen.filter((option) => getStil(option.stilId));
  const desserts = snapshot.gaenge.filter((gang) => gang.istDessert && gang.stilId && getStil(gang.stilId));

  return (
    <>
      {optionen.length > 0 && (
        <ul className="weinbegleitung-optionen" aria-label="Ein Wein für alle Gänge">
          {optionen.map((option) => {
            const istEmpfehlung = option.stilId === snapshot.gemeinsamerStilId;
            return (
              <OptionZeile
                key={option.stilId}
                stilId={option.stilId}
                label={option.label}
                istEmpfehlung={istEmpfehlung}
                fixiert={istEmpfehlung && fixiert}
                zusatz={amBestenZu(option)}
                offen={offen === option.stilId}
                onUmschalten={() => umschalten(option.stilId)}
              >
                <h3 className="weinbegleitung-abschnitt">Warum passt das?</h3>
                {option.label === LABEL_BEDINGT && (
                  <p className="weinbegleitung-bedingt">Die beste Wahl in dieser Farbe, aber nicht zu jedem Gang ein guter Partner.</p>
                )}
                {(option.gaenge || []).map((gang) => (
                  <div key={`${gang.sektionIndex}-${gang.sektionName}`} className="weinbegleitung-gruende-gang">
                    <h4 className="weinbegleitung-gruende-gang-titel">
                      {gang.sektionName}:{' '}
                      <span className={gang.label === LABEL_BEDINGT ? 'weinbegleitung-gang-label--bedingt' : undefined}>
                        {gang.label}
                      </span>
                    </h4>
                    <Gruende regelIds={gang.regelIds} mitQuellen={false} />
                  </div>
                ))}
                {!istEmpfehlung && darfAendern && (
                  <FestlegenKnopf stil={getStil(option.stilId)} onClick={() => wein.alternativeWaehlen(null, option.stilId)} />
                )}
                {istEmpfehlung && fixiert && darfAendern && <LoesenKnopf onClick={() => wein.fixierungLoesen(null)} />}
              </OptionZeile>
            );
          })}
        </ul>
      )}

      {desserts.map((gang) => {
        const schluessel = `dessert-${gang.sektionIndex}`;
        return (
          <div key={schluessel} className="weinbegleitung-kopf-dessert">
            <p className="weinbegleitung-kopf-abschnitt">{gang.sektionName}</p>
            <ul className="weinbegleitung-optionen" aria-label={`Wein zu ${gang.sektionName}`}>
              <OptionZeile
                stilId={gang.stilId}
                label={gang.label}
                offen={offen === schluessel}
                onUmschalten={() => umschalten(schluessel)}
              >
                <h3 className="weinbegleitung-abschnitt">Warum passt das?</h3>
                <Gruende regelIds={gang.regelIds} mitQuellen={false} />
              </OptionZeile>
            </ul>
          </div>
        );
      })}
    </>
  );
}

/** Weinzeile eines Gangs (Modus „Pro Gang“ und ältere Snapshots im Modus „Ein Wein“). */
function GangOptionZeile({ wein, gang, eintrag, offen, onUmschalten, darfTauschen }) {
  const stil = getStil(eintrag.stilId);
  return (
    <OptionZeile
      stilId={eintrag.stilId}
      label={eintrag.label}
      istEmpfehlung={eintrag.istEmpfehlung}
      fixiert={eintrag.istEmpfehlung && gang.fixiert}
      offen={offen}
      onUmschalten={onUmschalten}
    >
      <h3 className="weinbegleitung-abschnitt">Warum passt das?</h3>
      {eintrag.label === LABEL_BEDINGT && (
        <p className="weinbegleitung-bedingt">Die beste Wahl in dieser Farbe, aber kein idealer Partner für diesen Gang.</p>
      )}
      <Gruende regelIds={eintrag.regelIds} mitQuellen={false} />
      {!eintrag.istEmpfehlung && darfTauschen && (
        <FestlegenKnopf stil={stil} onClick={() => wein.alternativeWaehlen(gang, eintrag.stilId)} />
      )}
      {eintrag.istEmpfehlung && gang.fixiert && wein.darfBearbeiten && !wein.arbeit && (
        <LoesenKnopf onClick={() => wein.fixierungLoesen(gang)} />
      )}
    </OptionZeile>
  );
}

/**
 * Weine eines Gangs unter der Gang-Überschrift: die Empfehlung und je eine Rot- und
 * Weißwein-Option (Snapshot-Feld `optionen`), offen sichtbar. Gänge ohne Empfehlung zeigen
 * den Hinweis und, wo vorhanden, die Optionen. Im Modus „Ein Wein“ stehen die Weine im Kopf,
 * am Gang nur der Hinweis, wenn er ohne Wein bleibt.
 */
export function WeinbegleitungGang({ wein, sektionIndex, sektionName }) {
  const [offenesStil, setOffenesStil] = useState(null);
  if (!wein?.snapshot) return null;
  const gang = wein.gangFuer(sektionIndex, sektionName);
  if (!gang) return null;

  if (zeigtEinWeinImKopf(wein.snapshot)) {
    return gang.hinweis === HINWEIS_KEIN_STIL || gang.hinweis === HINWEIS_OHNE_PROFIL
      ? <HinweisZeile gang={gang} mitOptionen={false} />
      : null;
  }

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
          <GangOptionZeile
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
