import { useEffect } from 'react';
import { WeinSymbol, Gruende } from './WeinbegleitungTeile';
import { alleStile, alleRegeln, alleQuellen, formatTemperatur } from '../utils/weinbegleitung/wissensbasis';
import { RULES_VERSION } from '../utils/weinbegleitung/konstanten';
import { nurZuText } from '../utils/weinbegleitung/anzeige';
import { beispielText, stilName } from '../utils/weinbegleitung/sprache';
import { useSprache, useTexte } from '../contexts/SpracheContext';
import { findeText } from '../i18n/texte';
import { formatiereDatum } from '../i18n/format';
import weinTexte from '../i18n/texte/wein';
import WeinprofilNachtragen from './WeinprofilNachtragen';
import { UnterseiteKopf, Kennzahl } from './Unterseite';
import './WeinbegleitungSeite.css';

/**
 * Seite „Weinbegleitung“ unter „Chefkoch & mehr“ (Tracker docs/vorhaben/weinbegleitung.md, PR 5):
 * wie die Empfehlung entsteht, die Regeln (die Gründe unter „Warum passt das?“), die Weinstile
 * und die Quellen. Admins können hier die Gericht-Profile für den Bestand nachtragen (WeinprofilNachtragen.js,
 * bleibt deutsch). Alles kommt aus der statischen Wissensbasis; die Seite lädt nichts nach.
 * Mehrsprachigkeit PR 6o: Texte aus wein.js, Stile und Beispiele über sprache.js; Quellen sind Eigennamen.
 */

// Abrufdatum (JJJJ-MM-TT) als Ortszeit, damit sich der Tag nicht verschiebt
const datumAusIso = (iso) => {
  const [jahr, monat, tag] = iso.split('-').map(Number);
  return new Date(jahr, monat - 1, tag);
};

// icons: die eingerichteten Wein-Icons (`weinIconsAus` in anzeige.js), leer/null = eingebautes Glas
function WeinbegleitungSeite({ currentUser, onBack, icons = null }) {
  // Wie in den Rules und im Server: allein die Rolle entscheidet über Admin.
  const istAdmin = currentUser?.role === 'admin';
  const t = useTexte(weinTexte);
  const { sprache } = useSprache();
  const quellen = alleQuellen();
  // Der Lizenzhinweis steht in quellen.json deutsch; der bekannte erscheint übersetzt, andere, wie sie sind
  const hinweise = [...new Set(quellen.map((quelle) => quelle.lizenzhinweis).filter(Boolean))]
    .map((hinweis) => (findeText(weinTexte, hinweis, ['lizenzNurVerlinkt']) ? t('lizenzNurVerlinkt') : hinweis));

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="wein-seite">
      <UnterseiteKopf onZurueck={onBack}>
        <h2>{t('weinbegleitung')}</h2>
      </UnterseiteKopf>

      <div className="unterseite-kennzahlen">
        <Kennzahl wert={alleStile().length} label={t('kennzahlWeinstile')} />
        <Kennzahl wert={alleRegeln().length} label={t('kennzahlRegeln')} />
        <Kennzahl wert={quellen.length} label={t('kennzahlQuellen')} />
      </div>

      <section className="wein-seite-karte" aria-labelledby="wein-seite-so">
        <h3 id="wein-seite-so" className="wein-seite-titel">{t('soEntsteht')}</h3>
        <p className="wein-seite-text">{t('soEntstehtProfil')}</p>
        <p className="wein-seite-text">{t('soEntstehtRegeln', { einWein: t('modusEinWein') })}</p>
        <p className="wein-seite-text">{t('soEntstehtKulinarik')}</p>
        <p className="wein-seite-klein">{t('standRegeln', { version: RULES_VERSION })}</p>
      </section>

      <section className="wein-seite-karte" aria-labelledby="wein-seite-regeln">
        <h3 id="wein-seite-regeln" className="wein-seite-titel">{t('dieRegeln')}</h3>
        <p className="wein-seite-text">{t('regelnHinweis', { warum: t('warumPasst') })}</p>
        <Gruende regelIds={alleRegeln().map((regel) => regel.id)} />
      </section>

      <section className="wein-seite-karte" aria-labelledby="wein-seite-stile">
        <h3 id="wein-seite-stile" className="wein-seite-titel">{t('dieWeinstile')}</h3>
        <ul className="wein-seite-stile">
          {alleStile().map((stil) => (
            <li key={stil.id} className="wein-seite-stil">
              <WeinSymbol stil={stil} icons={icons} groesse={22} />
              <span className="wein-seite-stil-text">
                <span className="wein-seite-stil-name">{stilName(stil, sprache)}</span>
                <span className="wein-seite-stil-details">
                  {stil.beispiele.map((beispiel) => beispielText(beispiel, sprache)).join(', ')} · <span className="wein-seite-nowrap">{formatTemperatur(stil)}</span>
                </span>
                {nurZuText(stil, t) && <span className="wein-seite-stil-details">{nurZuText(stil, t)}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="wein-seite-karte" aria-labelledby="wein-seite-quellen">
        <h3 id="wein-seite-quellen" className="wein-seite-titel">{t('dieQuellen')}</h3>
        <ul className="wein-seite-quellen">
          {quellen.map((quelle) => (
            <li key={quelle.id}>
              <a href={quelle.url} target="_blank" rel="noopener noreferrer">{quelle.titel}</a>
              <span className="wein-seite-quelle-meta">
                {quelle.herausgeber}
                {quelle.abgerufenAm ? t('abgerufenAm', { datum: formatiereDatum(datumAusIso(quelle.abgerufenAm), sprache, { day: '2-digit', month: '2-digit', year: 'numeric' }) }) : ''}
              </span>
            </li>
          ))}
        </ul>
        {hinweise.map((hinweis) => (
          <p key={hinweis} className="wein-seite-klein">{hinweis}</p>
        ))}
      </section>

      {istAdmin && <WeinprofilNachtragen />}
    </div>
  );
}

export default WeinbegleitungSeite;
