import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './EventsPage.css';
import './WichtelPage.css';
import OverviewAddFab from './OverviewAddFab';
import ConfirmDialog from './ConfirmDialog';
import WichtelZeile from './WichtelZeile';
import PencilIcon from './icons/PencilIcon';
import useUndoableDelete from '../hooks/useUndoableDelete';
import useInlineRename from '../hooks/useInlineRename';
import { canEditRecipes } from '../utils/userManagement';
import { getGuestDisplayName } from '../utils/guestPreferences';
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
  setzeWichtelAuslosungZurueck,
  setzeWichtelAusschluesse,
} from '../utils/wichtelFirestore';
import { buildWichtelLink, teileWichtelEinladung } from '../utils/wichtelLinks';

const MIN_TEILNEHMER = 3;
const HINWEIS_DAUER_MS = 3500;

const formatDatum = (ms) => (ms ? new Date(ms).toLocaleDateString('de-DE') : '');

const schluessel = (name) => String(name || '').trim().toLocaleLowerCase('de');

/** „Anna, Ben; Cleo“ oder eine Liste mit Zeilenumbrüchen → einzelne Namen. */
export const teileNamen = (eingabe) => String(eingabe || '')
  .split(/[,;\n]/)
  .map((name) => name.replace(/\s+/g, ' ').trim())
  .filter(Boolean);

function StatusPille({ status, ausgelostAm }) {
  const ausgelost = status === 'ausgelost';
  return (
    <span className={`wichtel-status${ausgelost ? ' wichtel-status--ausgelost' : ''}`}>
      {ausgelost ? `Ausgelost${ausgelostAm ? ` am ${formatDatum(ausgelostAm)}` : ''}` : 'Noch nicht ausgelost'}
    </span>
  );
}

function RundenFormular({ initial, titelText, submitLabel, busy, onSubmit, onCancel }) {
  const [titel, setTitel] = useState(initial?.titel || '');
  const [budget, setBudget] = useState(initial?.budget || '');
  const [hinweis, setHinweis] = useState(initial?.hinweis || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!titel.trim()) return;
    onSubmit({ titel: titel.trim(), budget: budget.trim(), hinweis: hinweis.trim() });
  };

  return (
    <form className="events-form wichtel-formular" onSubmit={handleSubmit}>
      <h3 className="wichtel-formular-titel">{titelText}</h3>
      <label className="events-form-field">
        <span>Titel</span>
        <input
          type="text"
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
          placeholder="z. B. Weihnachtsfeier 2026"
          maxLength={80}
          required
          autoFocus
        />
      </label>
      <div className="events-form-row">
        <label className="events-form-field">
          <span>Budget (optional)</span>
          <input
            type="text"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="z. B. 20 €"
            maxLength={40}
          />
        </label>
        <label className="events-form-field">
          <span>Hinweis (optional)</span>
          <input
            type="text"
            value={hinweis}
            onChange={(e) => setHinweis(e.target.value)}
            placeholder="z. B. Bescherung am 13.12. nach dem Essen"
            maxLength={300}
          />
        </label>
      </div>
      <div className="wichtel-formular-aktionen">
        <button type="button" className="events-secondary-btn" onClick={onCancel} disabled={busy}>
          Abbrechen
        </button>
        <button type="submit" className="events-primary-btn" disabled={busy || !titel.trim()}>
          {submitLabel}
        </button>
      </div>
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
  teilnehmer, andere, ausgelost, busy, swipeIcon, onRename, onDelete, onShare, linkSichtbar, link,
  ausschlussOffen, onAusschluesseKlappen, onAusschluss,
}) {
  const rename = useInlineRename(teilnehmer.name, (_alt, neu) => onRename(teilnehmer, neu));

  const status = ausgelost && teilnehmer.gezogen
    ? { text: 'Los gezogen', klasse: 'wichtel-chip--ok' }
    : teilnehmer.geoeffnet
      ? { text: 'Link geöffnet', klasse: '' }
      : { text: 'Link noch nicht geöffnet', klasse: 'wichtel-chip--leise' };

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
            onClick={rename.start}
            aria-label={`${teilnehmer.name} umbenennen`}
            title={`${teilnehmer.name} umbenennen`}
            disabled={busy}
          >
            <PencilIcon size={15} />
          </button>
        )}
      </div>
      {!panelOffen && ausgeschlosseneNamen.length > 0 && (
        <p className="wichtel-ausschluss-info">Beschenkt nicht: {ausgeschlosseneNamen.join(', ')}</p>
      )}
      <div className="wichtel-teilnehmer-fuss">
        <span className={`wichtel-chip ${status.klasse}`}>{status.text}</span>
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
function WichtelPage({ onBack, currentUser, guestProfiles = [] }) {
  const darfVerwalten = canEditRecipes(currentUser);
  const [ansicht, setAnsicht] = useState('liste'); // liste | neu | detail | bearbeiten
  const [runden, setRunden] = useState([]);
  const [rundenStatus, setRundenStatus] = useState('laden');
  const [detail, setDetail] = useState(null);
  const [detailStatus, setDetailStatus] = useState('laden');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');
  const [hinweis, setHinweis] = useState('');
  const [neuerName, setNeuerName] = useState('');
  const [zuruecksetzenFragen, setZuruecksetzenFragen] = useState(false);
  const [sichtbarerLink, setSichtbarerLink] = useState(null);
  const [ausschlussFuer, setAusschlussFuer] = useState(null);
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
    setNeuerName('');
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

  const handleHinzufuegen = async (namen) => {
    if (!detail || namen.length === 0) return;
    const sicht = await fuehreAus(() => fuegeWichtelTeilnehmerHinzu(detail.runde.id, namen));
    if (sicht) setNeuerName('');
  };

  const handleUmbenennen = (teilnehmer, name) => {
    fuehreAus(() => benenneWichtelTeilnehmerUm(detail.runde.id, teilnehmer.id, name));
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
    const ergebnis = await teileWichtelEinladung({ name: teilnehmer.name, titel: detail.runde.titel, link });
    if (ergebnis === 'kopiert') {
      zeigeHinweis(`Einladung für ${teilnehmer.name} kopiert.`);
    } else if (ergebnis === 'fehler') {
      setSichtbarerLink(teilnehmer.id);
      zeigeHinweis('Kopieren ging nicht – der Link steht jetzt unter dem Namen.');
    }
  };

  const handleAuslosen = () => fuehreAus(
    () => loseWichtelRundeAus(detail.runde.id),
    'Ausgelost – jetzt kann jeder sein Los ziehen.',
  );

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

  const gaesteVorschlaege = useMemo(() => {
    const vorhanden = new Set(teilnehmer.map((t) => schluessel(t.name)));
    const gesehen = new Set();
    return guestProfiles
      .map((gast) => getGuestDisplayName(gast))
      .filter((name) => {
        const key = schluessel(name);
        if (!key || vorhanden.has(key) || gesehen.has(key)) return false;
        gesehen.add(key);
        return true;
      })
      .sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
  }, [guestProfiles, teilnehmer]);

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
          titelText={bearbeiten ? detail.runde.titel : 'Worum geht es?'}
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
              {detail.runde.budget && <span className="wichtel-chip">Budget: {detail.runde.budget}</span>}
            </div>
            {detail.runde.hinweis && <p className="wichtel-runde-hinweis">{detail.runde.hinweis}</p>}

            <p className="wichtel-erklaerung">
              {ausgelost
                ? 'Jeder zieht über seinen persönlichen Link sein Los und sieht dort nur das eigene. Auch du siehst nicht, wer wen gezogen hat.'
                : 'Trag alle ein, die mitmachen, und lose dann aus. Die Links kannst du schon vorher verschicken – dann kann jeder seine Wünsche und Ideen für andere eintragen. Unter „Ausschlüsse“ legst du fest, wen jemand nicht ziehen soll – bei Paaren für beide.'}
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
                      ausgelost={ausgelost}
                      busy={busy}
                      swipeIcon={swipeIcon}
                      onRename={handleUmbenennen}
                      onDelete={handleTeilnehmerEntfernen}
                      onShare={handleTeilen}
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
                <>
                  <form
                    className="wichtel-hinzufuegen"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleHinzufuegen(teileNamen(neuerName));
                    }}
                  >
                    <input
                      type="text"
                      value={neuerName}
                      onChange={(e) => setNeuerName(e.target.value)}
                      placeholder="z. B. Anna, Ben, Cleo"
                      aria-label="Teilnehmer hinzufügen"
                      maxLength={2000}
                    />
                    <button type="submit" className="events-primary-btn" disabled={busy || teileNamen(neuerName).length === 0}>
                      Hinzufügen
                    </button>
                  </form>
                  {gaesteVorschlaege.length > 0 && (
                    <div className="wichtel-vorschlaege">
                      <span className="wichtel-leise">Aus deiner Gästeliste:</span>
                      <div className="wichtel-vorschlaege-chips">
                        {gaesteVorschlaege.map((name) => (
                          <button
                            key={name}
                            type="button"
                            className="wichtel-vorschlag"
                            onClick={() => handleHinzufuegen([name])}
                            disabled={busy}
                            aria-label={`${name} hinzufügen`}
                          >
                            + {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
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
            message="Alle bisher gezogenen Lose verfallen; wer schon gezogen hat, zieht nach dem nächsten Auslosen neu. Links, Wünsche und Ideen bleiben erhalten."
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
