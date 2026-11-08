import { useCallback, useEffect, useRef, useState } from 'react';
import './WichtelTeilnahmePage.css';
import WichtelZeile from './WichtelZeile';
import UndoSnackbar from './UndoSnackbar';
import GiftIcon from './icons/GiftIcon';
import LockIcon from './icons/LockIcon';
import useUndoableDelete from '../hooks/useUndoableDelete';
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion';
import { getCallableErrorDetails } from '../utils/callableErrors';
import {
  fuegeWichtelEintragHinzu,
  getWichtelFehlertext,
  ladeWichtelTeilnahme,
  loescheWichtelEintrag,
  zieheWichtelLos,
} from '../utils/wichtelFirestore';

const MAX_TEXT = 300;
const FEIER_DAUER_MS = 1800;
const FUNKEN = 8;

function Privat({ children }) {
  return (
    <p className="wt-privat">
      <span className="wt-privat-icon" aria-hidden="true"><LockIcon size={14} /></span>
      {children}
    </p>
  );
}

function EintragFormular({ label, placeholder, buttonText, busy, onSubmit, children }) {
  const [text, setText] = useState('');
  const handleSubmit = async (e) => {
    e.preventDefault();
    const sauber = text.trim();
    if (!sauber) return;
    if (await onSubmit(sauber)) setText('');
  };
  return (
    <form className="wt-formular" onSubmit={handleSubmit}>
      {children}
      <div className="wt-formular-zeile">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          maxLength={MAX_TEXT}
        />
        <button type="submit" className="wt-btn" disabled={busy || !text.trim()}>
          {buttonText}
        </button>
      </div>
    </form>
  );
}

/**
 * Der Zettel: geschlossen mit Siegel, offen mit dem gezogenen Namen.
 * `animiert`: gerade gezogen, Aufklappen und Funken abspielen.
 */
function Los({ offen, name, wackelt, animiert }) {
  return (
    <div
      className={`wt-los${offen ? ' wt-los--offen' : ''}${wackelt ? ' wt-los--wackelt' : ''}${animiert ? ' wt-los--animiert' : ''}`}
    >
      <div className="wt-los-innen">
        <div className="wt-los-seite wt-los-vorne" aria-hidden={offen}>
          <span className="wt-los-falz" />
          <span className="wt-los-siegel"><GiftIcon size={30} /></span>
        </div>
        <div className="wt-los-seite wt-los-hinten" aria-hidden={!offen}>
          <span className="wt-los-ueberzeile">Du beschenkst</span>
          <strong className="wt-los-name">{name || ''}</strong>
        </div>
      </div>
      {animiert && (
        <div className="wt-funken" aria-hidden="true">
          {Array.from({ length: FUNKEN }, (_, i) => (
            <span key={i} className="wt-funke" style={{ '--i': i }} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Teilnehmerseite eines Wichtel-Links (/wichteln/{rundeId}/{token}), ohne Login.
 * Alles kommt aus der Callable wichtelTeilnahme, die nur die Daten dieses
 * Teilnehmers herausgibt: sein Los (erst nach dem Ziehen), Wünsche und Ideen
 * über seinen Empfänger und seine eigenen Einträge.
 */
function WichtelTeilnahmePage({ rundeId, token, gueltig = true, currentUser, onClose }) {
  const [status, setStatus] = useState(gueltig ? 'laden' : 'ungueltig');
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState('');
  const [busy, setBusy] = useState(false);
  const [zieht, setZieht] = useState(false);
  const [feier, setFeier] = useState(false);
  const [ideeFuer, setIdeeFuer] = useState('');
  const reducedMotion = usePrefersReducedMotion();
  const ladeRef = useRef(false);
  const feierTimerRef = useRef(null);
  // Stilles Neuladen darf keine frischere Antwort einer Änderung überschreiben.
  const aenderungenRef = useRef(0);
  const laufendRef = useRef(0);
  const { banners, pendingKeys, scheduleDelete, undoDelete } = useUndoableDelete();

  const lade = useCallback(async ({ still = false } = {}) => {
    if (!gueltig || ladeRef.current || (still && laufendRef.current > 0)) return;
    ladeRef.current = true;
    const stand = aenderungenRef.current;
    if (!still) setStatus('laden');
    try {
      const neu = await ladeWichtelTeilnahme(rundeId, token);
      if (still && aenderungenRef.current !== stand) return;
      setDaten(neu);
      setStatus('bereit');
    } catch (error) {
      if (getCallableErrorDetails(error).code === 'not-found') setStatus('ungueltig');
      else if (!still) {
        setFehler(getWichtelFehlertext(error));
        setStatus('fehler');
      }
    } finally {
      ladeRef.current = false;
    }
  }, [gueltig, rundeId, token]);

  useEffect(() => {
    lade();
  }, [lade]);

  // Zurück auf der Seite (z. B. nach dem Auslosen durch den Organisator): still neu laden.
  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'visible') lade({ still: true });
    };
    document.addEventListener('visibilitychange', handleVisible);
    return () => document.removeEventListener('visibilitychange', handleVisible);
  }, [lade]);

  useEffect(() => () => clearTimeout(feierTimerRef.current), []);

  // Jede Änderung liefert den ganzen neuen Stand vom Server zurück.
  const aendere = async (aktion) => {
    aenderungenRef.current += 1;
    laufendRef.current += 1;
    try {
      setDaten(await aktion());
      return true;
    } finally {
      laufendRef.current -= 1;
    }
  };

  const fuehreAus = async (aktion) => {
    setBusy(true);
    setFehler('');
    try {
      return await aendere(aktion);
    } catch (error) {
      setFehler(getWichtelFehlertext(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleZiehen = async () => {
    setZieht(true);
    setFehler('');
    try {
      await aendere(() => zieheWichtelLos(rundeId, token));
      if (!reducedMotion) {
        setFeier(true);
        clearTimeout(feierTimerRef.current);
        feierTimerRef.current = setTimeout(() => setFeier(false), FEIER_DAUER_MS);
      }
    } catch (error) {
      setFehler(getWichtelFehlertext(error));
    } finally {
      setZieht(false);
    }
  };

  const handleLoeschen = (eintrag, art) => {
    scheduleDelete({
      key: `eintrag_${eintrag.id}`,
      message: art === 'wunsch' ? 'Wunsch entfernt.' : 'Idee entfernt.',
      onConfirm: async () => {
        try {
          await aendere(() => loescheWichtelEintrag(rundeId, token, eintrag.id));
        } catch (error) {
          setFehler(getWichtelFehlertext(error));
        }
      },
      onUndo: () => {},
    });
  };

  const sichtbar = (liste) => (liste || []).filter((e) => !pendingKeys.has(`eintrag_${e.id}`));

  const letzterBanner = banners[banners.length - 1];

  if (status === 'laden') {
    return <div className="wt-seite wt-mitte" role="status">Dein Wichtel-Los wird geholt …</div>;
  }

  if (status === 'ungueltig') {
    return (
      <div className="wt-seite wt-mitte">
        <h1 className="wt-titel">Link ungültig</h1>
        <p className="wt-text">
          Dieser Wichtel-Link funktioniert nicht (mehr). Vielleicht wurde er nicht vollständig
          kopiert, oder die Runde wurde gelöscht. Frag am besten den Organisator nach deinem Link.
        </p>
      </div>
    );
  }

  if (status === 'fehler' || !daten) {
    return (
      <div className="wt-seite wt-mitte">
        <h1 className="wt-titel">Das hat nicht geklappt</h1>
        <p className="wt-text">{fehler}</p>
        <button type="button" className="wt-btn" onClick={() => lade()}>Nochmal versuchen</button>
      </div>
    );
  }

  const { runde, ich, andere, los } = daten;
  const meineWuensche = sichtbar(daten.meineWuensche);
  const gezogen = Boolean(los?.gezogen);
  const empfaenger = los?.empfaenger;
  const ausgelost = runde.status === 'ausgelost';

  const gruppen = new Map();
  sichtbar(daten.meineIdeen).forEach((idee) => {
    if (!gruppen.has(idee.ueberId)) gruppen.set(idee.ueberId, { name: idee.ueberName, ideen: [] });
    gruppen.get(idee.ueberId).ideen.push(idee);
  });
  const ideenNachGast = [...gruppen.entries()]
    .sort((a, b) => a[1].name.localeCompare(b[1].name, 'de', { sensitivity: 'base' }));

  let losText;
  if (!ausgelost) {
    losText = 'Noch nicht ausgelost. Sobald es so weit ist, ziehst du hier dein Los. Deine Wünsche und Ideen für andere kannst du schon jetzt eintragen.';
  } else if (!gezogen) {
    losText = 'Dein Los liegt bereit. Nur du siehst, wen du ziehst.';
  } else {
    losText = <>Du beschenkst <strong>{empfaenger?.name}</strong>. Psst – das bleibt unter uns.</>;
  }

  return (
    <div className="wt-seite">
      <header className="wt-kopf">
        <p className="wt-ueberzeile">Wichteln</p>
        <h1 className="wt-titel">{runde.titel}</h1>
        <p className="wt-gruss">Hallo {ich.name}!</p>
        {(runde.budget || runde.hinweis) && (
          <div className="wt-eckdaten">
            {runde.budget && <span className="wt-chip">Budget: {runde.budget}</span>}
            {runde.hinweis && <p className="wt-text">{runde.hinweis}</p>}
          </div>
        )}
      </header>

      {fehler && <p className="wt-fehler" role="alert">{fehler}</p>}

      <section className="wt-karte wt-los-karte" aria-labelledby="wt-los-titel">
        <h2 id="wt-los-titel" className="wt-abschnitt-titel">Dein Los</h2>
        <Los offen={gezogen} name={empfaenger?.name} wackelt={zieht} animiert={feier} />
        <p className={`wt-text wt-mitte-text${feier ? ' wt-spaeter' : ''}`} aria-live="polite">{losText}</p>
        {ausgelost && !gezogen && (
          <button type="button" className="wt-btn wt-btn--gross" onClick={handleZiehen} disabled={zieht}>
            {zieht ? 'Wird gezogen …' : 'Los ziehen'}
          </button>
        )}
      </section>

      {gezogen && empfaenger && (
        <section className={`wt-karte${feier ? ' wt-spaeter' : ''}`} aria-labelledby="wt-partner-titel">
          <h2 id="wt-partner-titel" className="wt-abschnitt-titel">Für {empfaenger.name}</h2>
          <h3 className="wt-unter-titel">Wünsche von {empfaenger.name}</h3>
          {los.wuensche.length === 0 ? (
            <p className="wt-leer">{empfaenger.name} hat noch keine Wünsche eingetragen.</p>
          ) : (
            <ul className="wt-liste">
              {los.wuensche.map((w) => <li key={w.id} className="wt-eintrag">{w.text}</li>)}
            </ul>
          )}
          <h3 className="wt-unter-titel">Ideen von anderen Gästen</h3>
          {los.ideen.length === 0 ? (
            <p className="wt-leer">Noch keine Ideen von anderen.</p>
          ) : (
            <ul className="wt-liste">
              {los.ideen.map((idee) => (
                <li key={idee.id} className="wt-eintrag">
                  {idee.text}
                  <span className="wt-von">{idee.vonDir ? 'von dir' : `von ${idee.von || 'einem Gast'}`}</span>
                </li>
              ))}
            </ul>
          )}
          <Privat>Nur du siehst diese Wünsche und Ideen.</Privat>
        </section>
      )}

      <section className="wt-karte" aria-labelledby="wt-wuensche-titel">
        <h2 id="wt-wuensche-titel" className="wt-abschnitt-titel">Deine Wünsche</h2>
        <Privat>Sieht nur, wer dich gezogen hat.</Privat>
        {meineWuensche.length > 0 && (
          <ul className="wt-liste">
            {meineWuensche.map((w) => (
              <WichtelZeile key={w.id} itemName={`Wunsch „${w.text}“`} onDelete={() => handleLoeschen(w, 'wunsch')}>
                <span className="wt-eintrag-text">{w.text}</span>
              </WichtelZeile>
            ))}
          </ul>
        )}
        <EintragFormular
          label="Wunsch hinzufügen"
          placeholder="Was wünschst du dir?"
          buttonText="Hinzufügen"
          busy={busy}
          onSubmit={(text) => fuehreAus(() => fuegeWichtelEintragHinzu(rundeId, token, ich.id, text))}
        />
      </section>

      {andere.length > 0 && (
        <section className="wt-karte" aria-labelledby="wt-ideen-titel">
          <h2 id="wt-ideen-titel" className="wt-abschnitt-titel">Geschenkideen für andere</h2>
          <p className="wt-text">
            Du weißt, worüber sich jemand freuen würde? Deine Idee sieht nur, wer diese Person gezogen hat –
            mit deinem Namen, die Person selbst nie.
          </p>
          <EintragFormular
            label="Geschenkidee"
            placeholder="Deine Idee"
            buttonText="Speichern"
            busy={busy || !ideeFuer}
            onSubmit={(text) => fuehreAus(() => fuegeWichtelEintragHinzu(rundeId, token, ideeFuer, text))}
          >
            <label className="wt-auswahl">
              <span>Für wen?</span>
              <select value={ideeFuer} onChange={(e) => setIdeeFuer(e.target.value)}>
                <option value="">Gast wählen</option>
                {andere.map((gast) => <option key={gast.id} value={gast.id}>{gast.name}</option>)}
              </select>
            </label>
          </EintragFormular>
          {ideenNachGast.map(([gastId, gruppe]) => (
            <div key={gastId} className="wt-ideen-gruppe">
              <h3 className="wt-unter-titel">Für {gruppe.name}</h3>
              <ul className="wt-liste">
                {gruppe.ideen.map((idee) => (
                  <WichtelZeile key={idee.id} itemName={`Idee „${idee.text}“`} onDelete={() => handleLoeschen(idee, 'idee')}>
                    <span className="wt-eintrag-text">{idee.text}</span>
                  </WichtelZeile>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {currentUser && onClose && (
        <button type="button" className="wt-link" onClick={onClose}>Zur App</button>
      )}

      {letzterBanner && (
        <UndoSnackbar key={letzterBanner.id} message={letzterBanner.message} onUndo={() => undoDelete(letzterBanner.id)} />
      )}
    </div>
  );
}

export default WichtelTeilnahmePage;
