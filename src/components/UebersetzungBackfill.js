import Button from './Button';
import useSeitenweiserBackfill, { BACKFILL_STATUS } from '../hooks/useSeitenweiserBackfill';

/**
 * Einstellungen › KI: Übersetzungen für den Bestand nachtragen (Vorhaben Mehrsprachigkeit: Rezepttitel
 * mit PR 3, Inhalte mit PR 4, Namen und Beschreibungen von Listen, Menüs und Events mit PR 6u; nur Admins).
 * Neue und geänderte Einträge übersetzen die Trigger ohnehin. Admin-Bereich, deshalb deutsch (NUR_DEUTSCH
 * in src/i18nPolicy.test.js).
 *
 * @param {object} props
 * @param {function({cursor: (string|null)}): Promise<object>} props.aufruf - Callable einer Seite
 * @param {string} props.textNurAdmins - Meldung, wenn die Function den Aufruf ablehnt
 * @param {string} [props.einheit] - was gezählt wird, in der Mehrzahl („Rezepte“, „Einträge“)
 */
function UebersetzungBackfill({ aufruf, textNurAdmins, einheit = 'Rezepte' }) {
  const { status, stand, fehler, kannFortsetzen, haltAngefragt, starten, fortsetzen, anhalten } =
    useSeitenweiserBackfill(aufruf, { textNurAdmins });
  const laeuft = status === BACKFILL_STATUS.LAEUFT;
  const vonGesamt = typeof stand.gesamt === 'number' ? ` von ${stand.gesamt}` : '';
  const zustand = {
    [BACKFILL_STATUS.LAEUFT]: haltAngefragt ? 'Hält nach dieser Seite an …' : 'Läuft …',
    [BACKFILL_STATUS.ANGEHALTEN]: 'Angehalten.',
    [BACKFILL_STATUS.TAGESLIMIT]: 'Tageslimit erreicht, morgen geht es mit „Fortsetzen“ weiter.',
    [BACKFILL_STATUS.FERTIG]: 'Fertig.',
  }[status];

  return (
    <>
      {status !== BACKFILL_STATUS.BEREIT && (
        <p className="section-description" role="status">
          {`${stand.geprueft}${vonGesamt} ${einheit} geprüft · ${stand.neu} übersetzt · `
            + `${stand.uebersprungen} übersprungen · ${stand.fehlgeschlagen} fehlgeschlagen`
            + (zustand ? ` · ${zustand}` : '')}
        </p>
      )}
      {fehler && <p className="section-description" role="alert">{fehler}</p>}
      <div className="settings-actions">
        {laeuft ? (
          <Button variant="secondary" onClick={anhalten} disabled={haltAngefragt}>Anhalten</Button>
        ) : (
          <>
            {kannFortsetzen && <Button variant="secondary" onClick={fortsetzen}>Fortsetzen</Button>}
            <Button variant="secondary" onClick={starten}>
              {status === BACKFILL_STATUS.BEREIT ? 'Übersetzungen nachtragen' : 'Von vorn beginnen'}
            </Button>
          </>
        )}
      </div>
    </>
  );
}

export default UebersetzungBackfill;
