import React, { useEffect, useRef, useState } from 'react';
import { WeinGlas, Gruende } from './WeinbegleitungTeile';
import { alleStile, alleRegeln, alleQuellen, formatTemperatur } from '../utils/weinbegleitung/wissensbasis';
import { RULES_VERSION } from '../utils/weinbegleitung/konstanten';
import { weinfarbe, nurZuText } from '../utils/weinbegleitung/anzeige';
import useWeinprofilBackfill, { BACKFILL_STATUS } from '../hooks/useWeinprofilBackfill';
import { getButtonIcons, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';
import './WeinbegleitungSeite.css';

/**
 * Seite „Weinbegleitung“ unter „Chefkoch & mehr“ (Tracker docs/vorhaben/weinbegleitung.md, PR 5):
 * wie die Empfehlung entsteht, die Regeln (die Gründe unter „Warum passt das?“), die Weinstile
 * und die Quellen. Admins können hier die Gericht-Profile für den Bestand nachtragen.
 * Alles kommt aus der statischen Wissensbasis; die Seite lädt nichts nach.
 */

const datum = (iso) => {
  const [jahr, monat, tag] = iso.split('-');
  return `${tag}.${monat}.${jahr}`;
};

function Fortschritt({ stand }) {
  const { geprueft, neu, uebersprungen, fehlgeschlagen, gesamt } = stand;
  const mitGesamt = typeof gesamt === 'number' && gesamt > 0 && geprueft <= gesamt;
  const teile = [`${neu} neu eingeschätzt`, `${uebersprungen} schon aktuell`];
  if (fehlgeschlagen > 0) teile.push(`${fehlgeschlagen} fehlgeschlagen`);
  return (
    <div className="wein-seite-fortschritt">
      {mitGesamt && (
        <progress
          className="wein-seite-fortschritt-balken"
          max={gesamt}
          value={geprueft}
          aria-label="Fortschritt beim Nachtragen"
        />
      )}
      <p className="wein-seite-fortschritt-text">
        <strong>
          {mitGesamt
            ? `${geprueft} von ${gesamt} Rezepten geprüft`
            : `${geprueft} ${geprueft === 1 ? 'Rezept' : 'Rezepte'} geprüft`}
        </strong>
        <span className="wein-seite-fortschritt-teile">
          {teile.map((teil, index) => (
            <React.Fragment key={teil}>
              {index > 0 && ' · '}
              <span className="wein-seite-nowrap">{teil}</span>
            </React.Fragment>
          ))}
        </span>
      </p>
    </div>
  );
}

function statusText(status, stand) {
  switch (status) {
    case BACKFILL_STATUS.LAEUFT:
      return 'Läuft … Die Seite kann offen bleiben, bis alle Rezepte geprüft sind.';
    case BACKFILL_STATUS.ANGEHALTEN:
      return 'Angehalten. „Fortsetzen“ macht beim nächsten Rezept weiter.';
    case BACKFILL_STATUS.TAGESLIMIT:
      return 'Das Tageslimit für Wein-Einschätzungen ist erreicht. Morgen kannst du fortsetzen.';
    case BACKFILL_STATUS.FEHLER:
      return '„Fortsetzen“ versucht es ab hier noch einmal.';
    case BACKFILL_STATUS.FERTIG:
      return stand.fehlgeschlagen > 0
        ? `Fertig. ${stand.fehlgeschlagen === 1 ? 'Ein Rezept konnte' : `${stand.fehlgeschlagen} Rezepte konnten`} nicht eingeschätzt werden; „Von vorn prüfen“ versucht es noch einmal, schon aktuelle Rezepte kosten dabei nichts.`
        : 'Fertig. Alle Rezepte haben ein aktuelles Profil.';
    default:
      return null;
  }
}

function ProfileNachtragen() {
  const { status, stand, fehler, kannFortsetzen, haltAngefragt, starten, fortsetzen, anhalten } = useWeinprofilBackfill();
  const laeuft = status === BACKFILL_STATUS.LAEUFT;
  const text = statusText(status, stand);

  return (
    <section className="wein-seite-karte" aria-labelledby="wein-seite-nachtragen">
      <h3 id="wein-seite-nachtragen" className="wein-seite-titel">Profile nachtragen</h3>
      <p className="wein-seite-text">
        Schätzt das Geschmacksprofil für alle Rezepte, die noch keins haben oder seitdem geändert wurden.
        Danach zeigen Rezeptseiten den passenden Wein sofort, und Menüs brauchen beim Erstellen keine
        Wartezeit mehr. Rezepte mit aktuellem Profil kosten nichts; jedes geschätzte Rezept zählt gegen
        dein Tageslimit für Wein-Einschätzungen.
      </p>

      {status !== BACKFILL_STATUS.BEREIT && <Fortschritt stand={stand} />}
      {text && <p className="wein-seite-status" role="status">{text}</p>}
      {fehler && <p className="wein-seite-fehler" role="alert">{fehler}</p>}

      <div className="wein-seite-aktionen">
        {laeuft ? (
          <button type="button" className="wein-seite-knopf" onClick={anhalten} disabled={haltAngefragt}>
            {haltAngefragt ? 'Wird angehalten …' : 'Anhalten'}
          </button>
        ) : (
          <>
            {kannFortsetzen && (
              <button type="button" className="wein-seite-knopf wein-seite-knopf--primaer" onClick={fortsetzen}>
                Fortsetzen
              </button>
            )}
            <button
              type="button"
              className={`wein-seite-knopf${kannFortsetzen ? '' : ' wein-seite-knopf--primaer'}`}
              onClick={starten}
            >
              {status === BACKFILL_STATUS.BEREIT ? 'Profile nachtragen' : 'Von vorn prüfen'}
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function WeinbegleitungSeite({ currentUser, onBack }) {
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);
  const closeBtnRef = useRef(null);
  // Wie in den Rules und im Server: allein die Rolle entscheidet über Admin.
  const istAdmin = currentUser?.role === 'admin';
  const quellen = alleQuellen();
  const hinweise = [...new Set(quellen.map((quelle) => quelle.lizenzhinweis).filter(Boolean))];

  useEffect(() => {
    getButtonIcons().then(setButtonIcons).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    closeBtnRef.current?.blur();
  }, []);

  const closeIcon = getEffectiveIcon(buttonIcons, 'closeButtonDefaultImg', isDarkMode)
    || getEffectiveIcon(buttonIcons, 'closeButton', isDarkMode)
    || DEFAULT_BUTTON_ICONS.closeButtonDefaultImg;

  return (
    <div className="wein-seite">
      <div className="wein-seite-kopf">
        <h2>Weinbegleitung</h2>
        {onBack && (
          <button
            ref={closeBtnRef}
            type="button"
            className="app-close-button"
            onClick={onBack}
            aria-label="Weinbegleitung schließen"
            title="Weinbegleitung schließen"
          >
            {isBase64Image(closeIcon) ? (
              <img src={closeIcon} alt="Weinbegleitung schließen" className="app-close-button-icon-img" />
            ) : (
              closeIcon
            )}
          </button>
        )}
      </div>

      <section className="wein-seite-karte" aria-labelledby="wein-seite-so">
        <h3 id="wein-seite-so" className="wein-seite-titel">So entsteht die Empfehlung</h3>
        <p className="wein-seite-text">
          Zu jedem Gericht schätzt die KI einmal ein Geschmacksprofil: welche Rolle es im Menü hat,
          Hauptzutat, Zubereitung und Sauce, wie kräftig es ist und wie viel Säure, Süße, Salz, Fett,
          Schärfe, Bitteres und Umami es mitbringt. Weine nennt die KI dabei nicht.
        </p>
        <p className="wein-seite-text">
          Den passenden Weinstil rechnet die App selbst aus diesem Profil und den Regeln unten. Im Menü
          achtet sie zusätzlich auf die Folge der Weine. Empfohlen werden Weinstile mit Rebsorten als
          Beispiel, nie Flaschen, Erzeuger, Jahrgänge oder Preise.
        </p>
        <p className="wein-seite-klein">Stand der Regeln: {RULES_VERSION}</p>
      </section>

      <section className="wein-seite-karte" aria-labelledby="wein-seite-regeln">
        <h3 id="wein-seite-regeln" className="wein-seite-titel">Die Regeln</h3>
        <p className="wein-seite-text">Diese Gründe stehen unter „Warum passt das?“. Hier stehen sie mit ihren Quellen.</p>
        <Gruende regelIds={alleRegeln().map((regel) => regel.id)} />
      </section>

      <section className="wein-seite-karte" aria-labelledby="wein-seite-stile">
        <h3 id="wein-seite-stile" className="wein-seite-titel">Die Weinstile</h3>
        <ul className="wein-seite-stile">
          {alleStile().map((stil) => (
            <li key={stil.id} className="wein-seite-stil">
              <WeinGlas farbe={weinfarbe(stil)} groesse={22} />
              <span className="wein-seite-stil-text">
                <span className="wein-seite-stil-name">{stil.name}</span>
                <span className="wein-seite-stil-details">
                  {stil.beispiele.join(', ')} · <span className="wein-seite-nowrap">{formatTemperatur(stil)}</span>
                </span>
                {nurZuText(stil) && <span className="wein-seite-stil-details">{nurZuText(stil)}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="wein-seite-karte" aria-labelledby="wein-seite-quellen">
        <h3 id="wein-seite-quellen" className="wein-seite-titel">Die Quellen</h3>
        <ul className="wein-seite-quellen">
          {quellen.map((quelle) => (
            <li key={quelle.id}>
              <a href={quelle.url} target="_blank" rel="noopener noreferrer">{quelle.titel}</a>
              <span className="wein-seite-quelle-meta">
                {quelle.herausgeber}
                {quelle.abgerufenAm ? `, abgerufen am ${datum(quelle.abgerufenAm)}` : ''}
              </span>
            </li>
          ))}
        </ul>
        {hinweise.map((hinweis) => (
          <p key={hinweis} className="wein-seite-klein">{hinweis}</p>
        ))}
      </section>

      {istAdmin && <ProfileNachtragen />}
    </div>
  );
}

export default WeinbegleitungSeite;
