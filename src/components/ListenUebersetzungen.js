import { useEffect, useMemo, useState } from 'react';
import Button from './Button';
import { useSprache } from '../contexts/SpracheContext';
import {
  UEBERSETZBARE_LISTEN,
  ZIELSPRACHEN,
  baueListenIndex,
  bereinigeUebersetzungen,
  fehlendeUebersetzungen,
  mitUebersetzung,
  quellwerte,
} from '../i18n/listenwerte';
import { saveListenUebersetzungen } from '../utils/customLists';
import { schlageListenUebersetzungenVor } from '../utils/uebersetzungCallables';
import { getCallableErrorDetails } from '../utils/callableErrors';
import './ListenUebersetzungen.css';

const SPRACH_NAMEN = { en: 'Englisch', fr: 'Französisch' };
/** So viele fehlende Werte gehen höchstens in einen Vorschlag (Grenze der Function). */
const MAX_JE_VORSCHLAG = 100;

/**
 * Vorschlag nur dort übernehmen, wo nichts steht; bei Einheiten auch eine fehlende Einzahl oder
 * Mehrzahl ergänzen.
 */
const ergaenze = (vorhanden, vorschlag) => {
  if (!vorschlag) return vorhanden;
  if (!vorhanden) return vorschlag;
  if (typeof vorhanden === 'string' || typeof vorschlag === 'string') return vorhanden;
  return {
    einzahl: vorhanden.einzahl?.trim() ? vorhanden.einzahl : vorschlag.einzahl,
    mehrzahl: vorhanden.mehrzahl?.trim() ? vorhanden.mehrzahl : vorschlag.mehrzahl,
  };
};

/**
 * Einstellungen › Listen & Kategorien: Übersetzungen der Auswahllisten pflegen (Vorhaben
 * Mehrsprachigkeit, PR 5). Gespeichert bleiben die deutschen Werte; hier entsteht nur die
 * Zuordnung für die Anzeige (settings/app.listenUebersetzungen, src/i18n/listenwerte.js).
 * „Fehlende mit KI vorschlagen“ füllt nur leere Felder (Function uebersetzeListenwerte, deshalb nur
 * für Admins sichtbar; von Hand pflegen kann, wer die Listen bearbeiten darf). Gespeichert wird erst
 * mit „Übersetzungen speichern“. Admin-Bereich, deshalb deutsch (NUR_DEUTSCH in src/i18nPolicy.test.js).
 *
 * @param {object} props
 * @param {object} props.lists - Listen wie aus getCustomLists
 * @param {boolean} [props.kiVorschlaege] - Knopf für KI-Vorschläge zeigen (nur Admins)
 */
function ListenUebersetzungen({ lists, kiVorschlaege = false }) {
  const { listenUebersetzungen, setzeListenUebersetzungen } = useSprache();
  const [entwurf, setEntwurf] = useState(() => listenUebersetzungen || {});
  const [geaendert, setGeaendert] = useState(false);
  const [laeuft, setLaeuft] = useState(null);
  const [meldung, setMeldung] = useState(null);

  // Später geladene Übersetzungen übernehmen, solange hier nichts geändert wurde.
  useEffect(() => {
    if (!geaendert) setEntwurf(listenUebersetzungen || {});
  }, [listenUebersetzungen, geaendert]);

  const index = useMemo(() => baueListenIndex(entwurf), [entwurf]);
  const fehlend = useMemo(() => fehlendeUebersetzungen(lists, entwurf), [lists, entwurf]);

  const aendern = (listeId, wert, sprache, uebersetzung) => {
    setEntwurf((alt) => mitUebersetzung(alt, listeId, wert, sprache, uebersetzung));
    setGeaendert(true);
    setMeldung(null);
  };

  const aendernEinheit = (listeId, wert, sprache, feld, text) => {
    const alt = index.get(listeId)?.get(wert)?.[sprache] || {};
    const neu = { einzahl: alt.einzahl || '', mehrzahl: alt.mehrzahl || '', [feld]: text };
    aendern(listeId, wert, sprache, neu.einzahl.trim() || neu.mehrzahl.trim() ? neu : null);
  };

  const vorschlagen = async () => {
    const eintraege = fehlend.slice(0, MAX_JE_VORSCHLAG).map(({ liste, wert, text, einzahl, mehrzahl }) => (
      einzahl ? { liste, wert, einzahl, mehrzahl } : { liste, wert, text }
    ));
    setLaeuft('vorschlag');
    setMeldung(null);
    try {
      const antwort = await schlageListenUebersetzungenVor(eintraege);
      const vorschlaege = Array.isArray(antwort?.vorschlaege) ? antwort.vorschlaege : [];
      setEntwurf((alt) => vorschlaege.reduce((stand, vorschlag) => ZIELSPRACHEN.reduce((zwischen, sprache) => {
        const vorhanden = baueListenIndex(zwischen).get(vorschlag.liste)?.get(vorschlag.wert)?.[sprache];
        const neu = ergaenze(vorhanden, vorschlag[sprache]);
        return neu === vorhanden ? zwischen : mitUebersetzung(zwischen, vorschlag.liste, vorschlag.wert, sprache, neu);
      }, stand), alt));
      setGeaendert(true);
      setMeldung({
        fehler: false,
        text: `${vorschlaege.length} ${vorschlaege.length === 1 ? 'Vorschlag' : 'Vorschläge'} eingetragen. Bitte prüfen und speichern.`,
      });
    } catch (error) {
      setMeldung({ fehler: true, text: getCallableErrorDetails(error).message || 'Das hat nicht geklappt. Versuch es gleich noch einmal.' });
    } finally {
      setLaeuft(null);
    }
  };

  const speichern = async () => {
    const bereinigt = bereinigeUebersetzungen(lists, entwurf);
    setLaeuft('speichern');
    setMeldung(null);
    try {
      await saveListenUebersetzungen(bereinigt);
      setzeListenUebersetzungen(bereinigt);
      setEntwurf(bereinigt);
      setGeaendert(false);
      setMeldung({ fehler: false, text: 'Übersetzungen gespeichert.' });
    } catch (error) {
      console.warn('Fehler beim Speichern der Listenübersetzungen:', error);
      setMeldung({ fehler: true, text: 'Speichern hat nicht geklappt. Versuch es gleich noch einmal.' });
    } finally {
      setLaeuft(null);
    }
  };

  return (
    <div className="settings-section listen-uebersetzungen">
      <h3>Übersetzungen der Listen</h3>
      <p className="section-description">
        In Rezepten und Filtern bleiben die deutschen Werte gespeichert. Hier legst du fest, wie sie auf Englisch und
        Französisch angezeigt werden (sichtbar mit der Berechtigung „Sprachwahl“). Leere Felder zeigen den deutschen Wert.
      </p>
      {UEBERSETZBARE_LISTEN.map((liste) => {
        const werte = quellwerte(lists, liste.id);
        if (werte.length === 0) return null;
        const offen = fehlend.filter((eintrag) => eintrag.liste === liste.id).length;
        return (
          <details key={liste.id} className="listen-uebersetzungen-liste">
            <summary>
              {liste.name}
              <span className="listen-uebersetzungen-stand">{offen ? `${offen} offen` : 'vollständig'}</span>
            </summary>
            <table className="listen-uebersetzungen-tabelle">
              <thead>
                <tr>
                  <th scope="col">Deutsch</th>
                  {ZIELSPRACHEN.map((sprache) => <th key={sprache} scope="col">{SPRACH_NAMEN[sprache]}</th>)}
                </tr>
              </thead>
              <tbody>
                {werte.map((quelle) => (
                  <tr key={quelle.wert}>
                    <th scope="row">{liste.art === 'einheit' ? `${quelle.einzahl} / ${quelle.mehrzahl}` : quelle.text}</th>
                    {ZIELSPRACHEN.map((sprache) => {
                      const wert = index.get(liste.id)?.get(quelle.wert)?.[sprache];
                      const name = liste.art === 'einheit' ? quelle.einzahl : quelle.text;
                      return (
                        <td key={sprache}>
                          {liste.art === 'einheit' ? (
                            <div className="listen-uebersetzungen-einheit">
                              <input
                                type="text"
                                aria-label={`${name}, ${SPRACH_NAMEN[sprache]}, Einzahl`}
                                placeholder="Einzahl"
                                value={wert?.einzahl || ''}
                                onChange={(event) => aendernEinheit(liste.id, quelle.wert, sprache, 'einzahl', event.target.value)}
                              />
                              <input
                                type="text"
                                aria-label={`${name}, ${SPRACH_NAMEN[sprache]}, Mehrzahl`}
                                placeholder="Mehrzahl"
                                value={wert?.mehrzahl || ''}
                                onChange={(event) => aendernEinheit(liste.id, quelle.wert, sprache, 'mehrzahl', event.target.value)}
                              />
                            </div>
                          ) : (
                            <input
                              type="text"
                              aria-label={`${name}, ${SPRACH_NAMEN[sprache]}`}
                              value={typeof wert === 'string' ? wert : ''}
                              onChange={(event) => aendern(liste.id, quelle.wert, sprache, event.target.value)}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        );
      })}
      {meldung && (
        <p className="section-description" role={meldung.fehler ? 'alert' : 'status'}>{meldung.text}</p>
      )}
      <div className="settings-actions">
        {kiVorschlaege && (
          <Button variant="secondary" onClick={vorschlagen} loading={laeuft === 'vorschlag'} disabled={fehlend.length === 0 || Boolean(laeuft)}>
            {fehlend.length ? `Fehlende mit KI vorschlagen (${Math.min(fehlend.length, MAX_JE_VORSCHLAG)})` : 'Alles übersetzt'}
          </Button>
        )}
        <Button variant="secondary" onClick={speichern} loading={laeuft === 'speichern'} disabled={!geaendert || Boolean(laeuft)}>
          Übersetzungen speichern
        </Button>
      </div>
    </div>
  );
}

export default ListenUebersetzungen;
