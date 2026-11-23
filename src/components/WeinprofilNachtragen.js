import React from 'react';
import useWeinprofilBackfill, { BACKFILL_STATUS } from '../hooks/useWeinprofilBackfill';

/**
 * „Profile nachtragen“ auf der Seite Weinbegleitung (WeinbegleitungSeite.js): Admins schätzen die Gericht-Profile
 * für den Bestand nach (Tracker docs/vorhaben/weinbegleitung.md, PR 5). Nur für die Rolle admin, deshalb wie der
 * übrige Admin-Bereich deutsch (NUR_DEUTSCH in src/i18nPolicy.test.js, Mehrsprachigkeit PR 6o).
 */

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

function WeinprofilNachtragen() {
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

export default WeinprofilNachtragen;
