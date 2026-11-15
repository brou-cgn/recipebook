import React, { useId, useMemo, useState } from 'react';
import { sichereId } from './WeinbegleitungTeile';
import { profilEinblick, testfallText, formatZahl, formatPunkte } from '../utils/weinbegleitung/einblick';
import './WeinprofilEinblick.css';

/**
 * Weinprofil-Einblick im Sheet „Wein dazu“ (Weinbegleitung, Tracker
 * docs/vorhaben/weinbegleitung.md, W1): aufklappbar, wie die KI das Gericht eingeschätzt hat
 * (Rolle, Hauptzutat, Zubereitung, Sauce, Intensität, Geschmackswerte, Konfidenz) und wie die
 * Punkte der besten Weinstile zustande kommen. „Werte kopieren“ legt das Profil als eine Zeile
 * JSON in die Zwischenablage, damit es als Testfall weitergegeben werden kann (W2).
 *
 * Wer den Einblick sieht, steuert die Berechtigung „weinprofilEinblick“ unter „Funktionen nach
 * Berechtigung“; das prüft der Aufrufer (WeinDazu), auf Freigabe-Seiten nie. Nur Anzeige,
 * kein KI-Aufruf.
 */

function Pfeil({ offen }) {
  return (
    <svg
      className={`wein-einblick-pfeil${offen ? ' wein-einblick-pfeil--offen' : ''}`}
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

const KOPIER_TEXT = {
  kopiert: 'Kopiert',
  fehler: 'Kopieren nicht möglich',
};

// Einträge mit „ · “ getrennt; umbrochen wird nur zwischen den Einträgen, nie mitten in „Sauce stark +3“
function Aufzaehlung({ eintraege }) {
  return eintraege.map((eintrag, index) => (
    <React.Fragment key={`${index}-${eintrag}`}>
      {index > 0 && ' · '}
      <span className="wein-einblick-eintrag">{eintrag}</span>
    </React.Fragment>
  ));
}

function WeinprofilEinblick({ rezept, profil }) {
  const [offen, setOffen] = useState(false);
  const [kopierStatus, setKopierStatus] = useState(null);
  const panelId = sichereId('wein-einblick', useId());
  const einblick = useMemo(() => profilEinblick(profil), [profil]);
  if (!einblick) return null;

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(testfallText(rezept, profil));
      setKopierStatus('kopiert');
    } catch {
      setKopierStatus('fehler');
    }
  };

  const herkunft = [
    einblick.konfidenz && `Konfidenz ${einblick.konfidenz}`,
    einblick.modell,
    einblick.datum && `eingeschätzt am ${einblick.datum}`,
  ].filter(Boolean);

  return (
    <section className="wein-einblick" aria-label="Einschätzung im Detail">
      <button
        type="button"
        className="wein-einblick-schalter"
        aria-expanded={offen}
        aria-controls={panelId}
        onClick={() => setOffen((vorher) => !vorher)}
      >
        Einschätzung im Detail
        <Pfeil offen={offen} />
      </button>

      {offen && (
        <div className="wein-einblick-inhalt" id={panelId}>
          <dl className="wein-einblick-werte">
            {einblick.werte.map(({ name, wert }) => (
              <div key={name} className="wein-einblick-wert">
                <dt>{name}</dt>
                <dd>{wert}</dd>
              </div>
            ))}
          </dl>

          <h4 className="wein-einblick-abschnitt">Geschmack (0 bis 3)</h4>
          <dl className="wein-einblick-komponenten">
            {einblick.komponenten.map(({ id, name, wert }) => (
              <div key={id} className="wein-einblick-komponente">
                <dt>{name}</dt>
                <dd>{wert}</dd>
              </div>
            ))}
          </dl>
          {herkunft.length > 0 && (
            <p className="wein-einblick-hinweis"><Aufzaehlung eintraege={herkunft} /></p>
          )}

          <h4 className="wein-einblick-abschnitt">Punkte der Weinstile</h4>
          <ol className="wein-einblick-stile">
            {einblick.stile.map((stil) => (
              <li
                key={stil.stilId}
                className={`wein-einblick-stil${stil.kandidat ? '' : ' wein-einblick-stil--aus'}`}
              >
                <div className="wein-einblick-stil-kopf">
                  <span>{stil.name}</span>
                  <span className="wein-einblick-stil-punkte">{formatZahl(stil.score)}</span>
                </div>
                <p className="wein-einblick-teile">
                  <Aufzaehlung eintraege={stil.teile.map((teil) => `${teil.text} ${formatPunkte(teil.punkte)}`)} />
                </p>
                {stil.einschraenkung && (
                  <p className="wein-einblick-teile">Kommt hier nicht infrage: {stil.einschraenkung}</p>
                )}
              </li>
            ))}
          </ol>
          <p className="wein-einblick-hinweis">
            Empfohlen wird ab {formatZahl(einblick.schwelle)} Punkten. Die Regeln R1 bis R11 erklärt die Seite
            {' '}„Weinbegleitung“ unter „Chefkoch &amp; mehr“.
          </p>

          <div className="wein-einblick-aktionen">
            <button type="button" className="wein-einblick-kopieren" onClick={kopieren}>
              Werte kopieren
            </button>
            {kopierStatus && (
              <span className="wein-einblick-status" role="status">{KOPIER_TEXT[kopierStatus]}</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default WeinprofilEinblick;
