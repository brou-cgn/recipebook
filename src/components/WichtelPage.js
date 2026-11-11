import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import './EventsPage.css';
import './WichtelPage.css';
import OverviewAddFab from './OverviewAddFab';
import ConfirmDialog from './ConfirmDialog';
import WichtelZeile from './WichtelZeile';
import WichtelTeilnehmerFormular from './WichtelTeilnehmerFormular';
import PencilIcon from './icons/PencilIcon';
import WarningIcon from './icons/WarningIcon';
import useUndoableDelete from '../hooks/useUndoableDelete';
import useInlineRename from '../hooks/useInlineRename';
import { canEditRecipes } from '../utils/userManagement';
import { getGuestDisplayName, normalizeGuestLanguage } from '../utils/guestPreferences';
import { DEFAULT_BUTTON_ICONS, getButtonIcons, getDarkModePreference, getEffectiveIcon } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';
import {
  aendereWichtelRunde,
  benenneWichtelTeilnehmerUm,
  entferneWichtelTeilnehmer,
  fuegeWichtelTeilnehmerHinzu,
  getWichtelFehlertext,
  ladeWichtelRunde,
  legeWichtelRundeAn,
  listeWichtelRunden,
  loescheWichtelRunde,
  loseWichtelRundeAus,
  sendeWichtelEinladung,
  setzeWichtelAuslosungZurueck,
  setzeWichtelAusschluesse,
} from '../utils/wichtelFirestore';
import { buildWichtelLink, teileWichtelEinladung } from '../utils/wichtelLinks';
import { formatBudget } from '../utils/formatBudget';
import { WICHTEL_ANLAESSE, wichtelAnlassLabel, vorgeschlagenerWichtelAnlass } from '../utils/wichtelAnlaesse';
import { formatWichtelDatum, heuteAlsWichtelDatum, wichtelAbstandText, wichtelKalenderblatt } from '../utils/wichtelDatum';
import { istGueltigeEmail } from '../utils/wichtelGaeste';

const MIN_TEILNEHMER = 3;
const HINWEIS_DAUER_MS = 3500;

const formatDatum = (ms) => (ms ? new Date(ms).toLocaleDateString('de-DE') : '');
const formatZeitpunkt = (ms) => (ms
  ? new Date(ms).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
  : '');

const schluessel = (name) => String(name || '').trim().toLocaleLowerCase('de');

const VERSAND_GRUND = {
  limit: 'Das Tageslimit für Wichtel-Mails ist erreicht.',
  'nicht-eingerichtet': 'Der Mailversand ist nicht eingerichtet.',
};

/**
 * Rückmeldung zum Feld `versand` einer Organisator-Antwort (functions/wichteln.js).
 * @param {{gesendet?: number, fehlgeschlagen?: number, grund?: string|null}} [versand]
 * @returns {{art: 'ok'|'fehler', text: string}|null} null: es sollte keine Mail rausgehen
 */
export const versandMeldung = (versand) => {
  const { gesendet = 0, fehlgeschlagen = 0, grund = null } = versand || {};
  if (fehlgeschlagen === 0) {
    if (gesendet === 0) return null;
    return { art: 'ok', text: gesendet === 1 ? 'Einladung per Mail verschickt.' : `${gesendet} Einladungen per Mail verschickt.` };
  }
  const wieviele = fehlgeschlagen === 1 ? 'Eine Einladung konnte' : `${fehlgeschlagen} Einladungen konnten`;
  const raus = gesendet > 0 ? ` (${gesendet} verschickt)` : '';
  const warum = VERSAND_GRUND[grund] || 'Der Mailversand hat nicht geklappt.';
  return { art: 'fehler', text: `${wieviele} nicht per Mail verschickt werden${raus}. ${warum} Teile den Link über „Link teilen“.` };
};

function StatusPille({ status, ausgelostAm }) {
  const ausgelost = status === 'ausgelost';
  return (
    <span className={`wichtel-status${ausgelost ? ' wichtel-status--ausgelost' : ''}`}>
      {ausgelost ? `Ausgelost${ausgelostAm ? ` am ${formatDatum(ausgelostAm)}` : ''}` : 'Noch nicht ausgelost'}
    </span>
  );
}

const KalenderIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

/**
 * Pflichtfeld „Wann wird gefeiert?“: eine Karte, über der das native Datumsfeld unsichtbar liegt –
 * ein Tipp öffnet die Datumsauswahl des Geräts. Gesetzt zeigt sie das Kalenderblatt.
 */
function DatumsKarte({ datum, onChange, fehler, min }) {
  const id = useId();
  const blatt = wichtelKalenderblatt(datum);
  const zeigePicker = (e) => {
    try {
      e.currentTarget.showPicker?.();
    } catch {
      // Ohne showPicker (oder ohne Nutzergeste) öffnet der Tipp das Feld wie gewohnt.
    }
  };
  return (
    <div className="wichtel-datum-feld">
      <span className="wichtel-feld-kopf">
        <span id={`${id}-label`}>Wann wird gefeiert?</span>
        <span className="wichtel-pflicht" aria-hidden="true">*</span>
      </span>
      <div className={`wichtel-datum-karte${blatt ? ' wichtel-datum-karte--gesetzt' : ''}${fehler ? ' wichtel-datum-karte--fehler' : ''}`}>
        {blatt ? (
          <span className="wichtel-datum-blatt" aria-hidden="true">
            <span className="wichtel-datum-blatt-monat">{blatt.monat}</span>
            <span className="wichtel-datum-blatt-tag">{blatt.tag}</span>
          </span>
        ) : (
          <span className="wichtel-datum-symbol" aria-hidden="true"><KalenderIcon /></span>
        )}
        <span className="wichtel-datum-text" id={`${id}-text`}>
          <span className="wichtel-datum-haupt">{blatt ? formatWichtelDatum(datum, 'de') : 'Datum wählen'}</span>
          <span className="wichtel-datum-unter">
            {blatt
              ? <>{wichtelAbstandText(datum)} · <span className="wichtel-datum-aendern">Ändern</span></>
              : 'Bis 3 Tage vorher erinnern wir alle, die noch nichts eingetragen haben.'}
          </span>
        </span>
        <input
          type="date"
          className="wichtel-datum-input"
          value={datum}
          onChange={(e) => onChange(e.target.value)}
          onClick={zeigePicker}
          min={min}
          max="2100-12-31"
          aria-labelledby={`${id}-label`}
          aria-describedby={fehler ? `${id}-fehler` : `${id}-text`}
          aria-invalid={fehler || undefined}
          aria-required="true"
        />
      </div>
      {fehler && (
        <span className="wichtel-feld-fehler" id={`${id}-fehler`} role="alert">
          <WarningIcon size={16} /> Bitte ein Datum für die Feier wählen.
        </span>
      )}
    </div>
  );
}

const HINWEIS_MAX = 300;

function RundenFormular({ initial, titelText, submitLabel, busy, onSubmit, onCancel }) {
  const [titel, setTitel] = useState(initial?.titel || '');
  // Bestehende Runden behalten ihren Anlass (auch keinen); nur neue bekommen die Saison-Vorauswahl.
  const [anlass, setAnlass] = useState(() => (initial ? initial.anlass || '' : vorgeschlagenerWichtelAnlass()));
  const [budget, setBudget] = useState(initial?.budget || '');
  const [hinweis, setHinweis] = useState(initial?.hinweis || '');
  const [datum, setDatum] = useState(initial?.datum || '');
  const [versucht, setVersucht] = useState(false);
  const id = useId();
  // Neue Runden ab heute; eine bestehende darf ihr (evtl. vergangenes) Datum behalten.
  const [minDatum] = useState(() => (initial ? '2020-01-01' : heuteAlsWichtelDatum()));
  const titelFehler = versucht && !titel.trim();
  const datumFehler = versucht && !datum;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!titel.trim() || !datum) {
      setVersucht(true);
      return;
    }
    onSubmit({ titel: titel.trim(), anlass, budget: budget.trim(), hinweis: hinweis.trim(), datum });
  };

  return (
    <form className="events-form wichtel-formular" onSubmit={handleSubmit} noValidate>
      {titelText && <h3 className="wichtel-formular-titel">{titelText}</h3>}
      <div className="events-form-field">
        <span className="wichtel-feld-kopf">
          <label htmlFor={`${id}-titel`}>Titel</label>
          <span className="wichtel-pflicht" aria-hidden="true">*</span>
        </span>
        <input
          id={`${id}-titel`}
          type="text"
          className={titelFehler ? 'wichtel-input--fehler' : undefined}
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
          placeholder="z. B. Weihnachtsfeier 2026"
          maxLength={80}
          aria-required="true"
          aria-invalid={titelFehler || undefined}
          aria-describedby={titelFehler ? `${id}-titel-fehler` : undefined}
          autoFocus
        />
        {titelFehler && (
          <span className="wichtel-feld-fehler" id={`${id}-titel-fehler`} role="alert">
            <WarningIcon size={16} /> Bitte gib der Runde einen Titel.
          </span>
        )}
      </div>
      {/* Auch nach dem Auslosen änderbar. Erinnerungs-Mails enden drei Tage vor dem Datum. */}
      <DatumsKarte datum={datum} onChange={setDatum} fehler={datumFehler} min={minDatum} />
      <div className="events-form-row">
        <label className="events-form-field">
          <span>Anlass</span>
          <select value={anlass} onChange={(e) => setAnlass(e.target.value)}>
            <option value="">Kein Anlass</option>
            {WICHTEL_ANLAESSE.map((a) => (
              <option key={a.key} value={a.key}>{a.label}</option>
            ))}
          </select>
        </label>
        <label className="events-form-field">
          <span>Budget</span>
          <input
            type="text"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="z. B. 20 €"
            maxLength={40}
          />
        </label>
      </div>
      <div className="events-form-field">
        <label htmlFor={`${id}-hinweis`}>Hinweis</label>
        <textarea
          id={`${id}-hinweis`}
          className="wichtel-hinweis-feld"
          rows={4}
          value={hinweis}
          onChange={(e) => setHinweis(e.target.value.slice(0, HINWEIS_MAX))}
          placeholder="z. B. Bescherung nach dem Essen. Bitte nichts Selbstgebackenes – wir haben genug Plätzchen."
          maxLength={HINWEIS_MAX}
          aria-describedby={`${id}-zaehler`}
        />
        <span className="wichtel-zeichen-zaehler" id={`${id}-zaehler`}>{hinweis.length} / {HINWEIS_MAX}</span>
      </div>
      <div className="wichtel-formular-aktionen">
        <button type="button" className="events-secondary-btn" onClick={onCancel} disabled={busy}>
          Abbrechen
        </button>
        <button type="submit" className="events-primary-btn" disabled={busy}>
          {submitLabel}
        </button>
      </div>
      <span className="wichtel-pflicht-legende"><span className="wichtel-pflicht" aria-hidden="true">*</span> Pflichtfeld</span>
    </form>
  );
}

/**
 * Wen ein Teilnehmer nicht ziehen soll: Umschalter je anderem Teilnehmer. Einer muss frei
 * bleiben, sonst könnte er niemanden beschenken.
 */
function Ausschluesse({ id, name, andere, ausgeschlossen, busy, onUmschalten }) {
  const nurNochEiner = andere.filter((gast) => !ausgeschlossen.has(gast.id)).length <= 1;
  return (
    <div id={id} className="wichtel-ausschluss" role="group" aria-labelledby={`${id}-titel`}>
      <span id={`${id}-titel`} className="wichtel-ausschluss-titel">{name} beschenkt nicht:</span>
      <div className="wichtel-ausschluss-chips">
        {andere.map((gast) => {
          const aktiv = ausgeschlossen.has(gast.id);
          return (
            <button
              key={gast.id}
              type="button"
              className="wichtel-ausschluss-chip"
              aria-pressed={aktiv}
              onClick={() => onUmschalten(gast.id)}
              disabled={busy || (!aktiv && nurNochEiner)}
            >
              {gast.name}
            </button>
          );
        })}
      </div>
      {nurNochEiner && (
        <span className="wichtel-leise">Mindestens einen Gast muss {name} beschenken können.</span>
      )}
    </div>
  );
}

function TeilnehmerZeile({
  teilnehmer, andere, gastProfil, ausgelost, busy, swipeIcon, onRename, onEditGuest, onDelete, onShare, onSendMail,
  linkSichtbar, link, ausschlussOffen, onAusschluesseKlappen, onAusschluss,
}) {
  const rename = useInlineRename(teilnehmer.name, (_alt, neu) => onRename(teilnehmer, neu));
  // Steht der Teilnehmer in der Gästeliste, öffnet der Stift seine Gästekarte; sonst wird inline umbenannt.
  const gastKarte = Boolean(gastProfil?.id && onEditGuest);
  const stiftLabel = gastKarte ? `${teilnehmer.name} bearbeiten` : `${teilnehmer.name} umbenennen`;

  const status = ausgelost && teilnehmer.gekauft
    ? { text: 'Geschenk gekauft', klasse: 'wichtel-chip--ok' }
    : ausgelost && teilnehmer.gezogen
    ? { text: 'Los gezogen', klasse: 'wichtel-chip--ok' }
    : teilnehmer.geoeffnet
      ? { text: 'Link geöffnet', klasse: '' }
      : { text: 'Link noch nicht geöffnet', klasse: 'wichtel-chip--leise' };
  const mail = teilnehmer.mail || null;
  // Wie der Server: eine gespeicherte, aber unbrauchbare Adresse bekommt keine Mail.
  const gastMitAdresse = Boolean(gastProfil?.id) && istGueltigeEmail(gastProfil.email);
  // Die erste Mail verschickt das Auslosen; von Hand (erneut) senden geht erst danach.
  const kannMailen = ausgelost && gastMitAdresse;
  // Beim Auslosen bekommt nur eine Mail, wer gespeichert verknüpft ist und noch keine zugestellte hat.
  const mailFolgt = !ausgelost && gastMitAdresse && Boolean(teilnehmer.gastId) && mail?.status !== 'gesendet';

  const ausgeschlossen = new Set(teilnehmer.ausschluesse || []);
  const ausgeschlosseneNamen = andere.filter((gast) => ausgeschlossen.has(gast.id)).map((gast) => gast.name);
  // Ausschließen lohnt erst, wenn außer dem Ausgeschlossenen noch jemand bleibt.
  const ausschliessbar = !ausgelost && andere.length >= 2;
  const panelOffen = ausschliessbar && ausschlussOffen;
  const panelId = `wichtel-ausschluesse-${teilnehmer.id}`;

  return (
    <WichtelZeile
      itemName={teilnehmer.name}
      swipeIcon={swipeIcon}
      onDelete={ausgelost ? undefined : () => onDelete(teilnehmer)}
      className="wichtel-teilnehmer"
    >
      <div className="wichtel-teilnehmer-kopf">
        {rename.isEditing ? (
          <input
            type="text"
            className="wichtel-umbenennen"
            value={rename.editValue}
            onChange={(e) => rename.setEditValue(e.target.value)}
            onKeyDown={rename.onKeyDown}
            onBlur={rename.confirm}
            maxLength={60}
            aria-label={`${teilnehmer.name} umbenennen`}
            autoFocus
          />
        ) : (
          <span className="wichtel-teilnehmer-name">{teilnehmer.name}</span>
        )}
        {!rename.isEditing && (
          <button
            type="button"
            className="wichtel-icon-btn"
            onClick={gastKarte ? () => onEditGuest(teilnehmer, gastProfil) : rename.start}
            aria-label={stiftLabel}
            title={stiftLabel}
            disabled={busy}
          >
            <PencilIcon size={15} />
          </button>
        )}
      </div>
      {ausgeschlosseneNamen.length > 0 && (
        <p className="wichtel-ausschluss-info">Beschenkt nicht: {ausgeschlosseneNamen.join(', ')}</p>
      )}
      <div className="wichtel-teilnehmer-fuss">
        <div className="wichtel-teilnehmer-status">
          <span className={`wichtel-chip ${status.klasse}`}>{status.text}</span>
          {mail?.status === 'gesendet' && (
            <span className="wichtel-chip" title={mail.am ? `Zuletzt am ${formatZeitpunkt(mail.am)}` : undefined}>
              Per Mail verschickt
            </span>
          )}
          {mail?.status === 'fehler' && (
            <span className="wichtel-chip wichtel-chip--fehler">Mail nicht verschickt</span>
          )}
          {mailFolgt && (
            <span className="wichtel-chip wichtel-chip--leise" title="Der persönliche Link geht beim Auslosen per Mail raus.">
              Mail beim Auslosen
            </span>
          )}
        </div>
        <div className="wichtel-teilnehmer-knoepfe">
          {ausschliessbar && (
            <button
              type="button"
              className="wichtel-ausschluss-btn"
              onClick={onAusschluesseKlappen}
              aria-expanded={panelOffen}
              aria-controls={panelOffen ? panelId : undefined}
            >
              Ausschlüsse
            </button>
          )}
          {kannMailen && (
            <button
              type="button"
              className="wichtel-link-btn wichtel-link-btn--leise"
              onClick={() => onSendMail(teilnehmer, gastProfil)}
              disabled={busy}
            >
              {mail ? 'Erneut senden' : 'Per Mail senden'}
            </button>
          )}
          <button type="button" className="wichtel-link-btn" onClick={() => onShare(teilnehmer)}>
            Link teilen
          </button>
        </div>
      </div>
      {panelOffen && (
        <Ausschluesse
          id={panelId}
          name={teilnehmer.name}
          andere={andere}
          ausgeschlossen={ausgeschlossen}
          busy={busy}
          onUmschalten={onAusschluss}
        />
      )}
      {linkSichtbar && (
        <input
          type="text"
          readOnly
          className="wichtel-link-feld"
          value={link}
          aria-label={`Link für ${teilnehmer.name}`}
          onFocus={(e) => e.target.select()}
        />
      )}
    </WichtelZeile>
  );
}

/**
 * Events > Wichteln: Runden anlegen, Teilnehmer eintragen, auslosen und die
 * persönlichen Links verschicken. Der Organisator sieht nie, wer wen gezogen hat –
 * die Antworten von wichtelVerwalten enthalten die Zuordnung gar nicht.
 */
/**
 * @param {Function} [renderGastBearbeiten] - (gast, onClose) => Element: Gästekarte zum Bearbeiten.
 *   onClose(gespeicherteDaten | null) kehrt zur Runde zurück. Die Seite bleibt dabei gemountet,
 *   damit die geöffnete Runde erhalten bleibt.
 */
function WichtelPage({ onBack, currentUser, guestProfiles = [], renderGastBearbeiten = null }) {
  const darfVerwalten = canEditRecipes(currentUser);
  const [ansicht, setAnsicht] = useState('liste'); // liste | neu | detail | bearbeiten
  const [runden, setRunden] = useState([]);
  const [rundenStatus, setRundenStatus] = useState('laden');
  const [detail, setDetail] = useState(null);
  const [detailStatus, setDetailStatus] = useState('laden');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');
  const [hinweis, setHinweis] = useState('');
  const [zuruecksetzenFragen, setZuruecksetzenFragen] = useState(false);
  const [sichtbarerLink, setSichtbarerLink] = useState(null);
  const [ausschlussFuer, setAusschlussFuer] = useState(null);
  const [gastInBearbeitung, setGastInBearbeitung] = useState(null); // { teilnehmer, gast }
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);
  const offeneRundeIdRef = useRef(null);
  const hinweisTimerRef = useRef(null);
  const { banners, pendingKeys, scheduleDelete, undoDelete } = useUndoableDelete();

  useEffect(() => {
    getButtonIcons().then(setButtonIcons).catch(() => {});
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => {
      window.removeEventListener('darkModeChange', handler);
      clearTimeout(hinweisTimerRef.current);
    };
  }, []);

  const closeIcon = getEffectiveIcon(buttonIcons, 'closeButtonDefaultImg', isDarkMode)
    || getEffectiveIcon(buttonIcons, 'closeButton', isDarkMode);
  const swipeIcon = getEffectiveIcon(buttonIcons, 'swipeDelete', isDarkMode);

  const zeigeHinweis = useCallback((text) => {
    setHinweis(text);
    clearTimeout(hinweisTimerRef.current);
    hinweisTimerRef.current = setTimeout(() => setHinweis(''), HINWEIS_DAUER_MS);
  }, []);

  // Antwort einer Organisator-Aktion in Liste und (falls offen) Detailansicht übernehmen.
  const uebernehme = useCallback((sicht) => {
    if (!sicht?.runde) return;
    if (sicht.runde.id === offeneRundeIdRef.current) setDetail(sicht);
    setRunden((prev) => (prev.some((r) => r.id === sicht.runde.id)
      ? prev.map((r) => (r.id === sicht.runde.id ? sicht.runde : r))
      : [sicht.runde, ...prev]));
  }, []);

  const ladeListe = useCallback(async () => {
    setRundenStatus('laden');
    try {
      setRunden(await listeWichtelRunden());
      setRundenStatus('bereit');
    } catch (error) {
      setFehler(getWichtelFehlertext(error));
      setRundenStatus('fehler');
    }
  }, []);

  useEffect(() => {
    if (darfVerwalten) ladeListe();
  }, [darfVerwalten, ladeListe]);

  const fuehreAus = async (aktion, erfolg) => {
    setBusy(true);
    setFehler('');
    try {
      const sicht = await aktion();
      uebernehme(sicht);
      if (erfolg) zeigeHinweis(erfolg);
      return sicht;
    } catch (error) {
      setFehler(getWichtelFehlertext(error));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const oeffneRunde = async (rundeId) => {
    offeneRundeIdRef.current = rundeId;
    setDetail(null);
    setDetailStatus('laden');
    setFehler('');
    setSichtbarerLink(null);
    setAusschlussFuer(null);
    setAnsicht('detail');
    try {
      const sicht = await ladeWichtelRunde(rundeId);
      if (offeneRundeIdRef.current !== rundeId) return;
      setDetail(sicht);
      setDetailStatus('bereit');
    } catch (error) {
      if (offeneRundeIdRef.current !== rundeId) return;
      setFehler(getWichtelFehlertext(error));
      setDetailStatus('fehler');
    }
  };

  const zurUebersicht = () => {
    offeneRundeIdRef.current = null;
    setFehler('');
    setAnsicht('liste');
  };

  const handleAnlegen = async (felder) => {
    const sicht = await fuehreAus(() => legeWichtelRundeAn(felder));
    if (!sicht) return;
    offeneRundeIdRef.current = sicht.runde.id;
    setDetail(sicht);
    setDetailStatus('bereit');
    setAnsicht('detail');
  };

  const handleAendern = async (felder) => {
    const sicht = await fuehreAus(() => aendereWichtelRunde(detail.runde.id, felder));
    if (sicht) setAnsicht('detail');
  };

  const handleRundeLoeschen = (runde) => {
    scheduleDelete({
      key: `runde_${runde.id}`,
      message: `„${runde.titel}“ gelöscht.`,
      onConfirm: async () => {
        try {
          await loescheWichtelRunde(runde.id);
          setRunden((prev) => prev.filter((r) => r.id !== runde.id));
        } catch (error) {
          setFehler(getWichtelFehlertext(error));
        }
      },
      onUndo: () => {},
    });
  };

  // Erfolg kurz unten einblenden; was nicht rausging, bleibt als Fehlerzeile stehen.
  const meldeVersand = (versand) => {
    const meldung = versandMeldung(versand);
    if (meldung?.art === 'ok') zeigeHinweis(meldung.text);
    if (meldung?.art === 'fehler') setFehler(meldung.text);
  };

  /**
   * @param {Array<object>} eintraege - siehe fuegeWichtelTeilnehmerHinzu
   * @param {string} [erfolg] - kurzer Hinweis nach dem Eintragen
   * @returns {Promise<boolean>} ob eingetragen wurde
   */
  const handleHinzufuegen = async (eintraege, erfolg) => {
    if (!detail || eintraege.length === 0) return false;
    return Boolean(await fuehreAus(() => fuegeWichtelTeilnehmerHinzu(detail.runde.id, eintraege), erfolg));
  };

  const handleMailSenden = async (teilnehmer, gast) => {
    const sicht = await fuehreAus(() => sendeWichtelEinladung(detail.runde.id, teilnehmer.id, gast.id));
    if (sicht) meldeVersand(sicht.versand);
  };

  const handleUmbenennen = (teilnehmer, name) => {
    fuehreAus(() => benenneWichtelTeilnehmerUm(detail.runde.id, teilnehmer.id, name));
  };

  // Gästekarte geschlossen: Hat sich der Name geändert, zieht der Teilnehmer nach.
  const handleGastBearbeitet = (gespeichert) => {
    const offen = gastInBearbeitung;
    setGastInBearbeitung(null);
    if (!gespeichert || !offen || !detail) return;
    const neuerName = getGuestDisplayName(gespeichert);
    if (neuerName && neuerName !== offen.teilnehmer.name) handleUmbenennen(offen.teilnehmer, neuerName);
  };

  const handleTeilnehmerEntfernen = (teilnehmer) => {
    const rundeId = detail.runde.id;
    scheduleDelete({
      key: `teilnehmer_${teilnehmer.id}`,
      message: `„${teilnehmer.name}“ entfernt.`,
      onConfirm: async () => {
        try {
          uebernehme(await entferneWichtelTeilnehmer(rundeId, teilnehmer.id));
        } catch (error) {
          setFehler(getWichtelFehlertext(error));
        }
      },
      onUndo: () => {},
    });
  };

  // Schaltet einen Ausschluss um; der Server liefert den neuen Stand zurück.
  const handleAusschluss = (teilnehmer, gastId) => {
    const bisher = teilnehmer.ausschluesse || [];
    const neu = bisher.includes(gastId) ? bisher.filter((id) => id !== gastId) : [...bisher, gastId];
    fuehreAus(() => setzeWichtelAusschluesse(detail.runde.id, teilnehmer.id, neu));
  };

  const handleTeilen = async (teilnehmer) => {
    const link = buildWichtelLink(detail.runde.id, teilnehmer.token);
    const ergebnis = await teileWichtelEinladung({
      name: teilnehmer.name,
      titel: detail.runde.titel,
      link,
      sprache: normalizeGuestLanguage(gastZuTeilnehmer(teilnehmer)?.sprache),
    });
    if (ergebnis === 'kopiert') {
      zeigeHinweis(`Einladung für ${teilnehmer.name} kopiert.`);
    } else if (ergebnis === 'fehler') {
      setSichtbarerLink(teilnehmer.id);
      zeigeHinweis('Kopieren ging nicht – der Link steht jetzt unter dem Namen.');
    }
  };

  // Mit dem Auslosen gehen die Einladungen raus: Erfolg kurz unten, was nicht rausging, bleibt stehen.
  const handleAuslosen = async () => {
    const sicht = await fuehreAus(() => loseWichtelRundeAus(detail.runde.id));
    if (!sicht) return;
    const meldung = versandMeldung(sicht.versand);
    if (meldung?.art === 'fehler') setFehler(meldung.text);
    zeigeHinweis(meldung?.art === 'ok' ? `Ausgelost – ${meldung.text}` : 'Ausgelost – jetzt kann jeder sein Los ziehen.');
  };

  const handleZuruecksetzen = async () => {
    setZuruecksetzenFragen(false);
    await fuehreAus(() => setzeWichtelAuslosungZurueck(detail.runde.id), 'Auslosung zurückgesetzt.');
  };

  const sichtbareRunden = useMemo(
    () => runden.filter((r) => !pendingKeys.has(`runde_${r.id}`)),
    [runden, pendingKeys],
  );

  const teilnehmer = useMemo(() => detail?.teilnehmer || [], [detail]);
  const sichtbareTeilnehmer = teilnehmer.filter((t) => !pendingKeys.has(`teilnehmer_${t.id}`));
  const entferntWird = teilnehmer.length !== sichtbareTeilnehmer.length;
  const ausgelost = detail?.runde?.status === 'ausgelost';

  // Eigene Gästeliste: nach ID (verknüpfte Teilnehmer) und nach Anzeigename (eingetippte Namen,
  // vor der Verknüpfung angelegte Teilnehmer). Bei gleichem Namen zählt der Gast mit E-Mail-Adresse.
  const gaeste = useMemo(() => {
    const nachId = new Map();
    const nachName = new Map();
    guestProfiles.forEach((gast) => {
      if (gast?.id) nachId.set(gast.id, gast);
      const key = schluessel(getGuestDisplayName(gast));
      if (!key) return;
      const bisher = nachName.get(key);
      if (!bisher || (!bisher.email && gast.email)) nachName.set(key, gast);
    });
    return { nachId, nachName };
  }, [guestProfiles]);

  // Ein Gast gehört zu höchstens einem Teilnehmer: Wer schon (ggf. unter anderem Namen) dabei
  // ist, wird über den Namen kein zweites Mal gefunden.
  const verknuepfteGaeste = useMemo(() => new Set(teilnehmer.map((t) => t.gastId).filter(Boolean)), [teilnehmer]);
  const freierGastMitNamen = (name) => {
    const gast = gaeste.nachName.get(schluessel(name));
    return gast?.id && !verknuepfteGaeste.has(gast.id) ? gast : null;
  };

  // Gast eines Teilnehmers: über die gespeicherte Verknüpfung, sonst über den gleichen Namen.
  const gastZuTeilnehmer = (t) => (t.gastId ? gaeste.nachId.get(t.gastId) || null : freierGastMitNamen(t.name));

  // Gäste für die Pillen beim Eintragen: noch nicht dabei, je Name einer (der mit E-Mail-Adresse).
  const gaesteVorschlaege = useMemo(() => {
    const vorhanden = new Set(teilnehmer.map((t) => schluessel(t.name)));
    return guestProfiles.filter((gast) => {
      const key = schluessel(getGuestDisplayName(gast));
      return Boolean(key && gast?.id) && gaeste.nachName.get(key) === gast
        && !vorhanden.has(key) && !verknuepfteGaeste.has(gast.id);
    });
  }, [guestProfiles, gaeste, teilnehmer, verknuepfteGaeste]);

  /** Gast aus der Gästeliste eintragen; eine eingetippte Adresse ergänzt eine im Profil fehlende. */
  const handleGastWaehlen = (gast, email = '') => handleHinzufuegen([
    { name: getGuestDisplayName(gast), gastId: gast.id, ...(email ? { email } : {}) },
  ]);

  /**
   * Vorname, Nachname, E-Mail aus dem Formular. Steht der Gast schon in der Gästeliste, wird er
   * verknüpft statt ein zweites Mal angelegt; sonst legt der Server ihn dort an.
   */
  const handleEintragen = ({ vorname, nachname, email }) => {
    const gast = gaeste.nachName.get(schluessel(`${vorname} ${nachname}`));
    if (gast?.id) return handleGastWaehlen(gast, email);
    return handleHinzufuegen(
      [{ vorname, nachname, ...(email ? { email } : {}) }],
      `${vorname} ${nachname} ist dabei und steht jetzt auch in deiner Gästeliste.`,
    );
  };

  const renderSchliessen = (label, onClick) => (
    <button className="app-close-button" onClick={onClick} aria-label={label} title={label}>
      {isBase64Image(closeIcon) ? (
        <img src={closeIcon} alt={label} className="app-close-button-icon-img" />
      ) : (
        closeIcon || '×'
      )}
    </button>
  );

  const fehlerZeile = fehler ? <p className="wichtel-fehler" role="alert">{fehler}</p> : null;
  const snackbars = (
    <>
      {banners.map((banner) => (
        <div key={banner.id} className="undo-snackbar" role="status">
          <span>{banner.message}</span>
          <button type="button" className="undo-snackbar-btn" onClick={() => undoDelete(banner.id)}>
            Rückgängig
          </button>
        </div>
      ))}
      {hinweis && <div className="wichtel-hinweis" role="status">{hinweis}</div>}
    </>
  );

  if (!darfVerwalten) {
    return (
      <div className="events-page-container wichtel-page">
        <div className="events-page-header">
          <h2>Wichteln</h2>
          {onBack && renderSchliessen('Wichteln schließen', onBack)}
        </div>
        <div className="events-empty-state">
          Wichtel-Runden können Mitglieder mit der Rolle „edit“ oder höher anlegen.
        </div>
      </div>
    );
  }

  if (gastInBearbeitung && renderGastBearbeiten) {
    return renderGastBearbeiten(gastInBearbeitung.gast, handleGastBearbeitet);
  }

  if (ansicht === 'neu' || (ansicht === 'bearbeiten' && detail)) {
    const bearbeiten = ansicht === 'bearbeiten';
    return (
      <div className="events-page-container wichtel-page">
        <div className="events-page-header">
          <h2>{bearbeiten ? 'Runde bearbeiten' : 'Neue Wichtel-Runde'}</h2>
        </div>
        {fehlerZeile}
        <RundenFormular
          initial={bearbeiten ? detail.runde : null}
          titelText={bearbeiten ? detail.runde.titel : null}
          submitLabel={bearbeiten ? 'Speichern' : 'Runde anlegen'}
          busy={busy}
          onSubmit={bearbeiten ? handleAendern : handleAnlegen}
          onCancel={() => {
            setFehler('');
            setAnsicht(bearbeiten ? 'detail' : 'liste');
          }}
        />
      </div>
    );
  }

  if (ansicht === 'detail') {
    return (
      <div className="events-page-container wichtel-page">
        <div className="events-page-header">
          <h2 className="wichtel-detail-titel">{detail?.runde?.titel || 'Wichteln'}</h2>
          <div className="events-page-header-actions">
            {detail && (
              <button
                type="button"
                className="wichtel-icon-btn"
                onClick={() => {
                  setFehler('');
                  setAnsicht('bearbeiten');
                }}
                aria-label="Runde bearbeiten"
                title="Runde bearbeiten"
              >
                <PencilIcon size={18} />
              </button>
            )}
            {renderSchliessen('Zur Übersicht', zurUebersicht)}
          </div>
        </div>

        {detailStatus === 'laden' && <div className="events-empty-state">Laden...</div>}
        {detailStatus === 'fehler' && (
          <div className="events-empty-state">
            {fehlerZeile}
            <button type="button" className="events-primary-btn" onClick={zurUebersicht}>Zur Übersicht</button>
          </div>
        )}

        {detailStatus === 'bereit' && detail && (
          <>
            <div className="wichtel-kopfdaten">
              <StatusPille status={detail.runde.status} ausgelostAm={detail.runde.ausgelostAm} />
              {wichtelAnlassLabel(detail.runde.anlass) && <span className="wichtel-chip">Anlass: {wichtelAnlassLabel(detail.runde.anlass)}</span>}
              {formatWichtelDatum(detail.runde.datum, 'de', 'kurz') && (
                <span className="wichtel-chip">Feier: {formatWichtelDatum(detail.runde.datum, 'de', 'kurz')}</span>
              )}
              {detail.runde.budget && <span className="wichtel-chip">Budget: {formatBudget(detail.runde.budget)}</span>}
            </div>
            {detail.runde.hinweis && <p className="wichtel-runde-hinweis">{detail.runde.hinweis}</p>}

            <p className="wichtel-erklaerung">
              {ausgelost
                ? 'Jeder zieht über seinen persönlichen Link sein Los und sieht dort nur das eigene. Auch du siehst nicht, wer wen gezogen hat.'
                : 'Trag alle ein, die mitmachen – wer noch nicht in deiner Gästeliste steht, wird dort angelegt. Beim Auslosen bekommt jeder mit E-Mail-Adresse seinen persönlichen Link per Mail und eine Erinnerung, solange er noch keine Wünsche eingetragen hat. Ohne Adresse teilst du den Link selbst über „Link teilen“, auf Wunsch auch schon vorher. Unter „Ausschlüsse“ legst du fest, wen jemand nicht ziehen soll – bei Paaren für beide.'}
            </p>

            {fehlerZeile}

            <section className="wichtel-abschnitt" aria-labelledby="wichtel-teilnehmer-titel">
              <h3 id="wichtel-teilnehmer-titel" className="wichtel-abschnitt-titel">
                Teilnehmer ({sichtbareTeilnehmer.length})
              </h3>

              {sichtbareTeilnehmer.length === 0 ? (
                <p className="wichtel-leer">Noch niemand eingetragen.</p>
              ) : (
                <ul className="wichtel-liste">
                  {sichtbareTeilnehmer.map((t) => (
                    <TeilnehmerZeile
                      key={t.id}
                      teilnehmer={t}
                      andere={sichtbareTeilnehmer.filter((anderer) => anderer.id !== t.id)}
                      gastProfil={gastZuTeilnehmer(t)}
                      ausgelost={ausgelost}
                      busy={busy}
                      swipeIcon={swipeIcon}
                      onRename={handleUmbenennen}
                      onEditGuest={renderGastBearbeiten ? (tn, gast) => setGastInBearbeitung({ teilnehmer: tn, gast }) : undefined}
                      onDelete={handleTeilnehmerEntfernen}
                      onShare={handleTeilen}
                      onSendMail={handleMailSenden}
                      linkSichtbar={sichtbarerLink === t.id}
                      link={buildWichtelLink(detail.runde.id, t.token)}
                      ausschlussOffen={ausschlussFuer === t.id}
                      onAusschluesseKlappen={() => setAusschlussFuer((offen) => (offen === t.id ? null : t.id))}
                      onAusschluss={(gastId) => handleAusschluss(t, gastId)}
                    />
                  ))}
                </ul>
              )}

              {ausgelost ? (
                <p className="wichtel-leise">Teilnehmer und Ausschlüsse ändern geht erst nach dem Zurücksetzen der Auslosung.</p>
              ) : (
                <WichtelTeilnehmerFormular
                  kandidaten={gaesteVorschlaege}
                  busy={busy}
                  onEintragen={handleEintragen}
                  onGastWaehlen={handleGastWaehlen}
                />
              )}
            </section>

            <div className="wichtel-aktionen">
              {ausgelost ? (
                <button
                  type="button"
                  className="events-secondary-btn"
                  onClick={() => setZuruecksetzenFragen(true)}
                  disabled={busy}
                >
                  Auslosung zurücksetzen
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="events-primary-btn wichtel-auslosen-btn"
                    onClick={handleAuslosen}
                    disabled={busy || entferntWird || sichtbareTeilnehmer.length < MIN_TEILNEHMER}
                  >
                    Jetzt auslosen
                  </button>
                  {sichtbareTeilnehmer.length < MIN_TEILNEHMER && (
                    <span className="wichtel-leise">Zum Auslosen braucht es mindestens {MIN_TEILNEHMER} Teilnehmer.</span>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {zuruecksetzenFragen && (
          <ConfirmDialog
            title="Auslosung zurücksetzen?"
            message="Alle bisher gezogenen Lose verfallen; wer schon gezogen hat, zieht nach dem nächsten Auslosen neu. Links, Wünsche und Ideen bleiben erhalten. Eine Einladungs-Mail bekommt beim nächsten Auslosen nur, wer noch keine hatte."
            confirmLabel="Zurücksetzen"
            onConfirm={handleZuruecksetzen}
            onCancel={() => setZuruecksetzenFragen(false)}
          />
        )}
        {snackbars}
      </div>
    );
  }

  return (
    <div className="events-page-container wichtel-page">
      <div className="events-page-header">
        <h2>Wichteln</h2>
        <div className="events-page-header-actions">
          <button
            type="button"
            className="events-primary-btn events-header-add-btn"
            onClick={() => {
              setFehler('');
              setAnsicht('neu');
            }}
            aria-label="Neue Wichtel-Runde anlegen"
          >
            + Runde
          </button>
          {onBack && renderSchliessen('Wichteln schließen', onBack)}
        </div>
      </div>

      <p className="wichtel-erklaerung">
        Lege eine Runde an, trag die Teilnehmer ein und lose aus. Jeder bekommt einen persönlichen Link:
        Dort zieht er sein Los, sieht die Wünsche seines Wichtelpartners und kann Geschenkideen für andere
        hinterlassen. Wer wen gezogen hat, sieht nur der Ziehende selbst.
      </p>

      {fehlerZeile}

      {rundenStatus === 'laden' ? (
        <div className="events-empty-state">Laden...</div>
      ) : sichtbareRunden.length === 0 ? (
        <div className="events-empty-state">
          <p>Noch keine Wichtel-Runde.</p>
          <button type="button" className="events-primary-btn" onClick={() => setAnsicht('neu')}>
            Erste Runde anlegen
          </button>
        </div>
      ) : (
        <ul className="wichtel-liste wichtel-runden">
          {sichtbareRunden.map((runde) => (
            <WichtelZeile
              key={runde.id}
              itemName={runde.titel}
              swipeIcon={swipeIcon}
              onDelete={() => handleRundeLoeschen(runde)}
              className="wichtel-runde"
            >
              <button type="button" className="wichtel-runde-oeffnen" onClick={() => oeffneRunde(runde.id)}>
                <span className="wichtel-runde-titel">{runde.titel}</span>
                <span className="wichtel-runde-meta">
                  <StatusPille status={runde.status} ausgelostAm={runde.ausgelostAm} />
                  {formatWichtelDatum(runde.datum, 'de', 'kurz') && (
                    <span className="wichtel-runde-datum">Feier {formatWichtelDatum(runde.datum, 'de', 'kurz')}</span>
                  )}
                  <span className="wichtel-runde-anzahl">
                    {runde.teilnehmerAnzahl === 1 ? '1 Teilnehmer' : `${runde.teilnehmerAnzahl} Teilnehmer`}
                  </span>
                </span>
              </button>
            </WichtelZeile>
          ))}
        </ul>
      )}

      {snackbars}
      <OverviewAddFab onClick={() => setAnsicht('neu')} title="Neue Wichtel-Runde" ariaLabel="Neue Wichtel-Runde anlegen" />
    </div>
  );
}

export default WichtelPage;
