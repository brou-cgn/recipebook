import Button from './Button';
import useTitelUebersetzungBackfill, { TITEL_BACKFILL_STATUS } from '../hooks/useTitelUebersetzungBackfill';

/**
 * Einstellungen › KI: Titelübersetzungen für den Rezeptbestand nachtragen (Vorhaben
 * Mehrsprachigkeit, PR 3; Function backfillTitelUebersetzungen, nur Admins). Neue und
 * geänderte Titel übersetzt der Trigger ohnehin. Admin-Bereich, deshalb deutsch
 * (NUR_DEUTSCH in src/i18nPolicy.test.js).
 */
function TitelUebersetzungBackfill() {
  const { status, stand, fehler, kannFortsetzen, haltAngefragt, starten, fortsetzen, anhalten } =
    useTitelUebersetzungBackfill();
  const laeuft = status === TITEL_BACKFILL_STATUS.LAEUFT;
  const vonGesamt = typeof stand.gesamt === 'number' ? ` von ${stand.gesamt}` : '';
  const zustand = {
    [TITEL_BACKFILL_STATUS.LAEUFT]: haltAngefragt ? 'Hält nach dieser Seite an …' : 'Läuft …',
    [TITEL_BACKFILL_STATUS.ANGEHALTEN]: 'Angehalten.',
    [TITEL_BACKFILL_STATUS.TAGESLIMIT]: 'Tageslimit erreicht, morgen geht es mit „Fortsetzen“ weiter.',
    [TITEL_BACKFILL_STATUS.FERTIG]: 'Fertig.',
  }[status];

  return (
    <>
      {status !== TITEL_BACKFILL_STATUS.BEREIT && (
        <p className="section-description" role="status">
          {`${stand.geprueft}${vonGesamt} Rezepte geprüft · ${stand.neu} übersetzt · `
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
              {status === TITEL_BACKFILL_STATUS.BEREIT ? 'Übersetzungen nachtragen' : 'Von vorn beginnen'}
            </Button>
          </>
        )}
      </div>
    </>
  );
}

export default TitelUebersetzungBackfill;
