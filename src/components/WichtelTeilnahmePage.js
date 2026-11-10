import { useCallback, useEffect, useRef, useState } from 'react';
import './WichtelTeilnahmePage.css';
import WichtelZeile from './WichtelZeile';
import WichtelLinkKarte, { seitenName } from './WichtelLinkKarte';
import UndoSnackbar from './UndoSnackbar';
import GiftIcon from './icons/GiftIcon';
import LockIcon from './icons/LockIcon';
import useUndoableDelete from '../hooks/useUndoableDelete';
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion';
import { getCallableErrorDetails } from '../utils/callableErrors';
import { formatBudget } from '../utils/formatBudget';
import { formatWichtelDatum } from '../utils/wichtelDatum';
import {
  fuegeWichtelEintragHinzu,
  ladeWichtelTeilnahme,
  loescheWichtelEintrag,
  zieheWichtelLos,
  setzeWichtelGeschenkGekauft,
} from '../utils/wichtelFirestore';
import {
  fuelleText,
  waehleWichtelSprache,
  wichtelFehlerSchluessel,
  wichtelTexte,
} from '../utils/wichtelTeilnahmeTexte';

const MAX_TEXT = 300;
const MAX_LINK = 2000;
const FEIER_DAUER_MS = 1800;
const FUNKEN = 8;

// Button „Geschenk gekauft“ der Neuigkeiten-Mail: persönlicher Link mit ?gekauft=1
// (GEKAUFT_PARAMETER in functions/wichteln.js). Die Seite fragt dann oben nach; gesetzt wird
// der Status erst per Klick, weil Link-Scanner der Mailprogramme Links auch ungefragt öffnen.
const GEKAUFT_PARAMETER = 'gekauft';

const gekauftAngefragt = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get(GEKAUFT_PARAMETER) === '1';

/** Nimmt ?gekauft=1 aus der Adresse, damit Neuladen oder Teilen die Rückfrage nicht mitnimmt. */
function entferneGekauftParameter() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has(GEKAUFT_PARAMETER)) return;
  params.delete(GEKAUFT_PARAMETER);
  const rest = params.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
}

function Privat({ children }) {
  return (
    <p className="wt-privat">
      <span className="wt-privat-icon" aria-hidden="true"><LockIcon size={14} /></span>
      {children}
    </p>
  );
}

/**
 * Text und optional ein Link; einer von beiden genügt. Zum Link holt der Server beim
 * Speichern die Vorschau, das dauert ein paar Sekunden – daher „Speichert …“.
 */
function EintragFormular({ label, placeholder, linkLabel, buttonText, t, busy, onSubmit, children }) {
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [sendet, setSendet] = useState(false);
  const leer = !text.trim() && !link.trim();
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (leer || sendet) return;
    setSendet(true);
    try {
      if (await onSubmit({ text: text.trim(), url: link.trim() })) {
        setText('');
        setLink('');
      }
    } finally {
      setSendet(false);
    }
  };
  return (
    // noValidate: „otto.de/…“ ohne https:// ist erlaubt, der Server ergänzt es.
    <form className="wt-formular" onSubmit={handleSubmit} noValidate>
      {children}
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        maxLength={MAX_TEXT}
      />
      <div className="wt-formular-zeile">
        <input
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder={t.linkPlatzhalter}
          aria-label={linkLabel}
          maxLength={MAX_LINK}
        />
        <button type="submit" className="wt-btn" disabled={busy || sendet || leer}>
          {sendet ? t.speichert : buttonText}
        </button>
      </div>
    </form>
  );
}

/** Text und Link-Vorschau eines Wunschs oder einer Idee. */
function EintragInhalt({ eintrag, t }) {
  return (
    <>
      {eintrag.text && <span className="wt-eintrag-text">{eintrag.text}</span>}
      {eintrag.url && <WichtelLinkKarte url={eintrag.url} vorschau={eintrag.vorschau} neuerTabText={t.neuerTab} />}
    </>
  );
}

/** Name eines Eintrags für „… entfernen“: Text, sonst Titel oder Seite des Links. */
const beschriftung = (eintrag, t) =>
  eintrag.text || eintrag.vorschau?.titel || seitenName(eintrag.url) || t.eintrag;

/**
 * Der Zettel: geschlossen mit Siegel, offen mit dem gezogenen Namen.
 * `animiert`: gerade gezogen, Aufklappen und Funken abspielen.
 */
function Los({ offen, name, ueberzeile, wackelt, animiert }) {
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
          <span className="wt-los-ueberzeile">{ueberzeile}</span>
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
 * Sprache (de/en/fr): Präferenz aus dem verknüpften Gästeprofil, sonst Browsersprache,
 * sonst Deutsch – siehe utils/wichtelTeilnahmeTexte.js.
 */
function WichtelTeilnahmePage({ rundeId, token, gueltig = true, currentUser, onClose }) {
  const [status, setStatus] = useState(gueltig ? 'laden' : 'ungueltig');
  const [daten, setDaten] = useState(null);
  // Schlüssel der Meldung in wichtelTexte(), damit sie in der Seitensprache erscheint.
  const [fehler, setFehler] = useState('');
  const [busy, setBusy] = useState(false);
  const [zieht, setZieht] = useState(false);
  const [feier, setFeier] = useState(false);
  const [ideeFuer, setIdeeFuer] = useState('');
  const [gekauftFrage, setGekauftFrage] = useState(gekauftAngefragt);
  const reducedMotion = usePrefersReducedMotion();
  const ladeRef = useRef(false);
  const feierTimerRef = useRef(null);
  // Stilles Neuladen darf keine frischere Antwort einer Änderung überschreiben.
  const aenderungenRef = useRef(0);
  const laufendRef = useRef(0);
  const { banners, pendingKeys, scheduleDelete, undoDelete } = useUndoableDelete();
  const sprache = waehleWichtelSprache(daten?.ich?.sprache);
  const t = wichtelTexte(sprache);

  // Auch am Dokument: Vorlesen und Übersetzungsangebote des Browsers richten sich danach.
  // Beim Verlassen („Zur App“) gilt wieder die Sprache der App.
  useEffect(() => {
    const html = document.documentElement;
    const vorher = html.getAttribute('lang');
    html.setAttribute('lang', sprache);
    return () => {
      if (vorher === null) html.removeAttribute('lang');
      else html.setAttribute('lang', vorher);
    };
  }, [sprache]);

  const lade = useCallback(async ({ still = false } = {}) => {
    if (!gueltig || ladeRef.current || (still && laufendRef.current > 0)) return;
    ladeRef.current = true;
    const stand = aenderungenRef.current;
    if (!still) {
      setStatus('laden');
      setFehler('');
    }
    try {
      const neu = await ladeWichtelTeilnahme(rundeId, token);
      if (still && aenderungenRef.current !== stand) return;
      setDaten(neu);
      setStatus('bereit');
    } catch (error) {
      if (getCallableErrorDetails(error).code === 'not-found') setStatus('ungueltig');
      else if (!still) {
        setFehler(wichtelFehlerSchluessel(error, 'laden'));
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

  useEffect(() => {
    if (gekauftFrage) entferneGekauftParameter();
  }, [gekauftFrage]);

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

  const fuehreAus = async (name, aktion) => {
    setBusy(true);
    setFehler('');
    try {
      return await aendere(aktion);
    } catch (error) {
      setFehler(wichtelFehlerSchluessel(error, name));
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
      setFehler(wichtelFehlerSchluessel(error, 'ziehen'));
    } finally {
      setZieht(false);
    }
  };

  const handleLoeschen = (eintrag, art) => {
    scheduleDelete({
      key: `eintrag_${eintrag.id}`,
      message: art === 'wunsch' ? t.wunschEntfernt : t.ideeEntfernt,
      onConfirm: async () => {
        try {
          await aendere(() => loescheWichtelEintrag(rundeId, token, eintrag.id));
        } catch (error) {
          setFehler(wichtelFehlerSchluessel(error, 'eintragLoeschen'));
        }
      },
      onUndo: () => {},
    });
  };

  const sichtbar = (liste) => (liste || []).filter((e) => !pendingKeys.has(`eintrag_${e.id}`));

  const letzterBanner = banners[banners.length - 1];

  if (status === 'laden') {
    return <div className="wt-seite wt-mitte" role="status" lang={sprache}>{t.laden}</div>;
  }

  if (status === 'ungueltig') {
    return (
      <div className="wt-seite wt-mitte" lang={sprache}>
        <h1 className="wt-titel">{t.ungueltigTitel}</h1>
        <p className="wt-text">{t.ungueltigText}</p>
      </div>
    );
  }

  if (status === 'fehler' || !daten) {
    return (
      <div className="wt-seite wt-mitte" lang={sprache}>
        <h1 className="wt-titel">{t.fehlerTitel}</h1>
        <p className="wt-text">{t[fehler] || t.fehlerAllgemein}</p>
        <button type="button" className="wt-btn" onClick={() => lade()}>{t.nochmal}</button>
      </div>
    );
  }

  const { runde, ich, andere, los } = daten;
  const feierDatum = formatWichtelDatum(runde.datum, sprache);
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
    .sort((a, b) => a[1].name.localeCompare(b[1].name, sprache, { sensitivity: 'base' }));

  let losText;
  if (!ausgelost) {
    losText = t.losNochNichtAusgelost;
  } else if (!gezogen) {
    losText = t.losBereit;
  } else {
    losText = fuelleText(t.losGezogen, { name: <strong key="name">{empfaenger?.name}</strong> });
  }

  return (
    <div className="wt-seite" lang={sprache}>
      <header className="wt-kopf">
        <p className="wt-ueberzeile">{t.ueberzeile}</p>
        <h1 className="wt-titel">{runde.titel}</h1>
        <p className="wt-gruss">{fuelleText(t.gruss, { name: ich.name })}</p>
        {(feierDatum || runde.budget || runde.hinweis) && (
          <div className="wt-eckdaten">
            {feierDatum && <span className="wt-chip">{fuelleText(t.feier, { datum: feierDatum })}</span>}
            {runde.budget && <span className="wt-chip">{fuelleText(t.budget, { budget: formatBudget(runde.budget, sprache) })}</span>}
            {runde.hinweis && <p className="wt-text wt-hinweis-text">{runde.hinweis}</p>}
          </div>
        )}
      </header>

      {fehler && <p className="wt-fehler" role="alert">{t[fehler]}</p>}

      {gekauftFrage && gezogen && empfaenger && (
        <section className="wt-karte wt-gekauft-frage" aria-live="polite">
          {los.gekauft ? (
            <p className="wt-text">{fuelleText(t.gekauftErledigt, { name: empfaenger.name })}</p>
          ) : (
            <>
              <h2 className="wt-abschnitt-titel">{fuelleText(t.gekauftFrage, { name: empfaenger.name })}</h2>
              <p className="wt-text">{t.gekauftFrageText}</p>
              <div className="wt-gekauft-knoepfe">
                <button
                  type="button"
                  className="wt-btn"
                  disabled={busy}
                  onClick={() => fuehreAus('geschenkGekauft', () => setzeWichtelGeschenkGekauft(rundeId, token, true))}
                >
                  {t.gekauftJa}
                </button>
                <button type="button" className="wt-link" onClick={() => setGekauftFrage(false)}>
                  {t.gekauftNichtJetzt}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      <section className="wt-karte wt-los-karte" aria-labelledby="wt-los-titel">
        <h2 id="wt-los-titel" className="wt-abschnitt-titel">{t.losTitel}</h2>
        <Los offen={gezogen} name={empfaenger?.name} ueberzeile={t.losUeberzeile} wackelt={zieht} animiert={feier} />
        <p className={`wt-text wt-mitte-text${feier ? ' wt-spaeter' : ''}`} aria-live="polite">{losText}</p>
        {ausgelost && !gezogen && (
          <button type="button" className="wt-btn wt-btn--gross" onClick={handleZiehen} disabled={zieht}>
            {zieht ? t.losWirdGezogen : t.losZiehen}
          </button>
        )}
      </section>

      {gezogen && empfaenger && (
        <section className={`wt-karte${feier ? ' wt-spaeter' : ''}`} aria-labelledby="wt-partner-titel">
          <h2 id="wt-partner-titel" className="wt-abschnitt-titel">{fuelleText(t.fuer, { name: empfaenger.name })}</h2>
          <h3 className="wt-unter-titel">{fuelleText(t.wuenscheVon, { name: empfaenger.name })}</h3>
          {los.wuensche.length === 0 ? (
            <p className="wt-leer">{fuelleText(t.keineWuensche, { name: empfaenger.name })}</p>
          ) : (
            <ul className="wt-liste">
              {los.wuensche.map((w) => (
                <li key={w.id} className="wt-eintrag"><EintragInhalt eintrag={w} t={t} /></li>
              ))}
            </ul>
          )}
          <h3 className="wt-unter-titel">{t.ideenAnderer}</h3>
          {los.ideen.length === 0 ? (
            <p className="wt-leer">{t.keineIdeen}</p>
          ) : (
            <ul className="wt-liste">
              {los.ideen.map((idee) => (
                <li key={idee.id} className="wt-eintrag">
                  <EintragInhalt eintrag={idee} t={t} />
                  <span className="wt-von">
                    {idee.vonDir ? t.vonDir : (idee.von ? fuelleText(t.von, { name: idee.von }) : t.vonGast)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Privat>{t.privatPartner}</Privat>
          <label className="wt-gekauft">
            <input
              type="checkbox"
              checked={Boolean(los.gekauft)}
              disabled={busy}
              onChange={(e) => fuehreAus('geschenkGekauft', () => setzeWichtelGeschenkGekauft(rundeId, token, e.target.checked))}
            />
            <span>
              <span className="wt-gekauft-label">{t.gekauftLabel}</span>
              <span className="wt-gekauft-hinweis">{t.gekauftHinweis}</span>
            </span>
          </label>
        </section>
      )}

      <section className="wt-karte" aria-labelledby="wt-wuensche-titel">
        <h2 id="wt-wuensche-titel" className="wt-abschnitt-titel">{t.meineWuensche}</h2>
        <Privat>{t.privatWuensche}</Privat>
        {meineWuensche.length > 0 && (
          <ul className="wt-liste">
            {meineWuensche.map((w) => (
              <WichtelZeile
                key={w.id}
                entfernenLabel={fuelleText(t.wunschEntfernen, { text: beschriftung(w, t) })}
                onDelete={() => handleLoeschen(w, 'wunsch')}
              >
                <EintragInhalt eintrag={w} t={t} />
              </WichtelZeile>
            ))}
          </ul>
        )}
        <EintragFormular
          label={t.wunschLabel}
          placeholder={t.wunschPlatzhalter}
          linkLabel={t.wunschLinkLabel}
          buttonText={t.hinzufuegen}
          t={t}
          busy={busy}
          onSubmit={({ text, url }) => fuehreAus('eintragHinzufuegen', () => fuegeWichtelEintragHinzu(rundeId, token, ich.id, text, url))}
        />
      </section>

      {andere.length > 0 && (
        <section className="wt-karte" aria-labelledby="wt-ideen-titel">
          <h2 id="wt-ideen-titel" className="wt-abschnitt-titel">{t.ideenTitel}</h2>
          <p className="wt-text">{t.ideenText}</p>
          <EintragFormular
            label={t.ideeLabel}
            placeholder={t.ideePlatzhalter}
            linkLabel={t.ideeLinkLabel}
            buttonText={t.speichern}
            t={t}
            busy={busy || !ideeFuer}
            onSubmit={({ text, url }) => fuehreAus('eintragHinzufuegen', () => fuegeWichtelEintragHinzu(rundeId, token, ideeFuer, text, url))}
          >
            <label className="wt-auswahl">
              <span>{t.fuerWen}</span>
              <select value={ideeFuer} onChange={(e) => setIdeeFuer(e.target.value)}>
                <option value="">{t.gastWaehlen}</option>
                {andere.map((gast) => <option key={gast.id} value={gast.id}>{gast.name}</option>)}
              </select>
            </label>
          </EintragFormular>
          {ideenNachGast.map(([gastId, gruppe]) => (
            <div key={gastId} className="wt-ideen-gruppe">
              <h3 className="wt-unter-titel">{fuelleText(t.fuer, { name: gruppe.name })}</h3>
              <ul className="wt-liste">
                {gruppe.ideen.map((idee) => (
                  <WichtelZeile
                    key={idee.id}
                    entfernenLabel={fuelleText(t.ideeEntfernen, { text: beschriftung(idee, t) })}
                    onDelete={() => handleLoeschen(idee, 'idee')}
                  >
                    <EintragInhalt eintrag={idee} t={t} />
                  </WichtelZeile>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {currentUser && onClose && (
        <button type="button" className="wt-link" onClick={onClose}>{t.zurApp}</button>
      )}

      {letzterBanner && (
        <UndoSnackbar
          key={letzterBanner.id}
          message={letzterBanner.message}
          actionLabel={t.rueckgaengig}
          onUndo={() => undoDelete(letzterBanner.id)}
        />
      )}
    </div>
  );
}

export default WichtelTeilnahmePage;
