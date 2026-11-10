import { useMemo, useState } from 'react';
import { getGuestDisplayName } from '../utils/guestPreferences';
import { istGueltigeEmail, sucheGaeste } from '../utils/wichtelGaeste';

const LEER = { vorname: '', nachname: '', email: '' };
const EMAIL_FEHLER_ID = 'wichtel-email-fehler';

const ohneLeerraum = (wert) => wert.replace(/\s+/g, ' ').trim();

/**
 * Teilnehmer eintragen: Vorname, Nachname und optional die E-Mail-Adresse. Wer noch nicht in der
 * Gästeliste steht, wird dort beim Eintragen angelegt (functions/wichteln.js). Beim Tippen in Vor-
 * oder Nachname erscheinen passende Gäste aus der Gästeliste als Pillen; ein Tipp trägt den Gast
 * ein. Eine eingetippte Adresse geht dabei mit und ergänzt eine im Profil fehlende.
 *
 * onEintragen({vorname, nachname, email}) und onGastWaehlen(gast, email) liefern true, wenn der
 * Teilnehmer eingetragen ist – erst dann leert sich das Formular.
 */
function WichtelTeilnehmerFormular({ kandidaten, busy, onEintragen, onGastWaehlen }) {
  const [felder, setFelder] = useState(LEER);
  const [emailFehler, setEmailFehler] = useState(false);
  const vorname = ohneLeerraum(felder.vorname);
  const nachname = ohneLeerraum(felder.nachname);
  const email = felder.email.trim().toLowerCase();
  const treffer = useMemo(
    () => sucheGaeste(kandidaten, { vorname: felder.vorname, nachname: felder.nachname }),
    [kandidaten, felder.vorname, felder.nachname],
  );

  const aendere = (feld) => (e) => {
    const wert = e.target.value;
    setFelder((alt) => ({ ...alt, [feld]: wert }));
    if (feld === 'email') setEmailFehler(false);
  };

  // Eine Adresse muss gültig sein, ein leeres Feld ist in Ordnung.
  const emailOk = () => {
    const ok = !email || istGueltigeEmail(email);
    setEmailFehler(!ok);
    return ok;
  };

  const abschliessen = (eingetragen) => {
    if (!eingetragen) return;
    setFelder(LEER);
    setEmailFehler(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy || !vorname || !nachname || !emailOk()) return;
    abschliessen(await onEintragen({ vorname, nachname, email }));
  };

  const handleWaehlen = async (gast) => {
    if (busy || !emailOk()) return;
    abschliessen(await onGastWaehlen(gast, email));
  };

  return (
    <form className="wichtel-hinzufuegen" onSubmit={handleSubmit} noValidate aria-label="Teilnehmer eintragen">
      <div className="wichtel-hinzufuegen-zeile">
        <label className="wichtel-feld">
          <span>Vorname</span>
          <input
            type="text"
            value={felder.vorname}
            onChange={aendere('vorname')}
            autoComplete="off"
            autoCapitalize="words"
            maxLength={40}
          />
        </label>
        <label className="wichtel-feld">
          <span>Nachname</span>
          <input
            type="text"
            value={felder.nachname}
            onChange={aendere('nachname')}
            autoComplete="off"
            autoCapitalize="words"
            maxLength={40}
          />
        </label>
      </div>

      {treffer.length > 0 && (
        <div className="wichtel-vorschlaege" role="group" aria-label="Passende Gäste aus deiner Gästeliste">
          <span className="wichtel-leise">Aus deiner Gästeliste:</span>
          <div className="wichtel-vorschlaege-chips">
            {treffer.map((gast) => {
              const name = getGuestDisplayName(gast);
              return (
                <button
                  key={gast.id}
                  type="button"
                  className="wichtel-vorschlag"
                  onClick={() => handleWaehlen(gast)}
                  disabled={busy}
                  aria-label={`${name} hinzufügen`}
                  title={istGueltigeEmail(gast.email) ? 'Bekommt den Link beim Auslosen per Mail' : 'Ohne E-Mail-Adresse: den Link teilst du selbst'}
                >
                  + {name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="wichtel-hinzufuegen-zeile">
        <label className="wichtel-feld">
          <span>E-Mail (optional)</span>
          <input
            type="email"
            inputMode="email"
            value={felder.email}
            onChange={aendere('email')}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            aria-invalid={emailFehler || undefined}
            aria-describedby={emailFehler ? EMAIL_FEHLER_ID : undefined}
          />
        </label>
        <button type="submit" className="events-primary-btn" disabled={busy || !vorname || !nachname}>
          Hinzufügen
        </button>
      </div>
      {emailFehler && (
        <p id={EMAIL_FEHLER_ID} className="wichtel-feld-fehler" role="alert">
          Diese E-Mail-Adresse sieht nicht gültig aus. Korrigiere sie oder lass das Feld leer.
        </p>
      )}
    </form>
  );
}

export default WichtelTeilnehmerFormular;
