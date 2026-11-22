import useSeitenweiserBackfill, { BACKFILL_STATUS } from './useSeitenweiserBackfill';
import { trageWeinprofileNach } from '../utils/weinbegleitung/weinprofilCallable';
import { weinprofilFehlertext } from '../utils/weinbegleitung/anzeige';

export { BACKFILL_STATUS };

const OPTIONEN = {
  textNurAdmins: 'Weinprofile nachtragen dürfen nur Admins.',
  fehlertext: weinprofilFehlertext,
};

/**
 * Admin-Backfill der Gericht-Profile (Tracker docs/vorhaben/weinbegleitung.md, PR 5) über den
 * gemeinsamen Hook useSeitenweiserBackfill (Ablauf, Anhalten, Fortsetzen siehe dort).
 *
 * @returns {{status: string, stand: Object, fehler: string|null, kannFortsetzen: boolean,
 *   haltAngefragt: boolean, starten: Function, fortsetzen: Function, anhalten: Function}}
 */
export default function useWeinprofilBackfill() {
  return useSeitenweiserBackfill(trageWeinprofileNach, OPTIONEN);
}
