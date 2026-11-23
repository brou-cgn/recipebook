import React, { useId, useState } from 'react';
import { WeinGlas, WeinSymbol, Gruende, sichereId } from './WeinbegleitungTeile';
import { getStil, formatTemperatur } from '../utils/weinbegleitung/wissensbasis';
import { beispieleFuerRegion } from '../utils/weinbegleitung/kulinarik';
import {
  MODUS_PRO_GANG,
  MODUS_EIN_WEIN,
  HINWEIS_KEIN_STIL,
  HINWEIS_OHNE_PROFIL,
  HINWEIS_KEIN_GEMEINSAMER_STIL,
  LABEL_BEDINGT,
} from '../utils/weinbegleitung/konstanten';
import { snapshotZaehler, zeigtEinWeinImKopf } from '../utils/weinbegleitung/menue';
import { beispielText, labelText, regionName, stilName } from '../utils/weinbegleitung/sprache';
import { abschnittAnzeige } from '../utils/menuSections';
import { useSprache, useTexte } from '../contexts/SpracheContext';
import weinTexte from '../i18n/texte/wein';
import festtafelTexte from '../i18n/texte/festtafel';
import './Weinbegleitung.css';

/**
 * Weinbegleitung im Menü-Detail (Variante B, Tracker docs/vorhaben/weinbegleitung.md).
 * Zustand und Aktionen kommen aus useMenueWeinbegleitung (Prop `wein`).
 * - WeinbegleitungUebersicht: Zusammenfassung vor dem ersten Gang mit Umschalter
 *   „Pro Gang“ / „Ein Wein für alles“, „Weinbegleitung erstellen“ bzw. „Neu berechnen“.
 *   Im Modus „Ein Wein“ stehen hier je eine Weiß- und eine Rotwein-Option für alle Gänge, mit
 *   dem Gang, zu dem sie am besten passen, und der eigene Wein zum Dessert.
 * - WeinbegleitungGang: im Modus „Pro Gang“ direkt unter der Gang-Überschrift die Empfehlung
 *   und je eine Rot- und Weißwein-Option, offen sichtbar, jede mit drei Rebsorten. Im Modus
 *   „Ein Wein“ steht dort nur noch, was den Gang ausnimmt (kein Wein, noch nicht eingeschätzt).
 * Jede Weinzeile klappt „Warum passt das?“ auf (ohne Quellen, wie im Rezept-Sheet);
 * Bearbeiter legen dort eine Option als Empfehlung fest. Leser und Freigabe-Seiten sehen nur
 * Ergebnisse, ohne Knöpfe.
 * `icons`: die eingerichteten Icons wie im Rezept-Sheet (`weinIconsAus` in anzeige.js) für die
 * Weinzeilen und „Hier lieber Bier oder Wasser“, leer = eingebautes Glas. Das Glas im Kopf bleibt
 * das eingebaute (füllt sich beim Berechnen).
 *
 * Texte aus wein.js in der geltenden Sprache (Mehrsprachigkeit PR 6g); Stile, Rebsorten, Regionen und
 * Labels über sprache.js, Standardnamen der Gänge über abschnittAnzeige. Der Snapshot bleibt deutsch.
 */

// Rebsorten-Beispiele je Weinoption im Menü (Eigentümer, 14.11.2026)
const MENUE_BEISPIELE_JE_STIL = 3;

const MODI = [
  { modus: MODUS_PRO_GANG, schluessel: 'modusProGang' },
  { modus: MODUS_EIN_WEIN, schluessel: 'modusEinWein' },
];

// Namen mit Komma, die letzten beiden mit „und“ in der geltenden Sprache
const aufzaehlung = (namen, t) => (namen.length < 2
  ? namen.join('')
  : `${namen.slice(0, -1).join(', ')} ${t('und')} ${namen[namen.length - 1]}`);

function einWeinZusammenfassung(snapshot, t) {
  const mitDessert = snapshot.gaenge.some((gang) => gang.istDessert && gang.stilId);
  if (snapshot.einWeinOptionen.length === 0) {
    return mitDessert ? t('eigenerDessertwein') : t('keinStilFuerAlle');
  }
  if (!snapshot.gemeinsamerStilId) return t('keinWeissOderRot');
  return mitDessert ? t('einWeinAusserDessert') : t('einWeinAlleGaenge');
}

function zusammenfassung(snapshot, t, sprache) {
  if (!snapshot) return t('zusammenfassungLeer');
  if (zeigtEinWeinImKopf(snapshot)) return einWeinZusammenfassung(snapshot, t);
  if (snapshot.modus === MODUS_EIN_WEIN) {
    const stil = getStil(snapshot.gemeinsamerStilId);
    return stil ? t('einWeinFuerAlles', { stil: stilName(stil, sprache) }) : t('keinStilFuerAlle');
  }
  const { weine, gaenge } = snapshotZaehler(snapshot);
  return t('weineFuerGaenge', { weine: t('weine', { anzahl: weine }), gaenge: t('gaenge', { anzahl: gaenge }) });
}

function arbeitText(arbeit, t) {
  if (arbeit?.art === 'schaetzen') {
    return t('gerichteEinschaetzen', { fertig: arbeit.fertig, gesamt: arbeit.gesamt });
  }
  return t('wirdBerechnet');
}

export function WeinbegleitungUebersicht({ wein, icons = null }) {
  const t = useTexte(weinTexte);
  const { sprache } = useSprache();
  if (!wein?.sichtbar) return null;
  const { snapshot, darfBearbeiten, arbeit, fehler, hinweis, veraltet } = wein;
  const modusSchluessel = MODI.find((eintrag) => eintrag.modus === snapshot?.modus)?.schluessel;

  return (
    <section className="weinbegleitung-uebersicht" aria-label={t('weinbegleitung')}>
      <div className="weinbegleitung-kopf">
        <WeinGlas farbe={snapshot ? 'rot' : null} laedt={Boolean(arbeit)} groesse={24} />
        <div className="weinbegleitung-kopf-text">
          <h2 className="weinbegleitung-titel">{t('weinbegleitung')}</h2>
          <p className="weinbegleitung-zusammenfassung">{zusammenfassung(snapshot, t, sprache)}</p>
        </div>
        {snapshot && !darfBearbeiten && modusSchluessel && (
          <span className="weinbegleitung-modus">{t(modusSchluessel)}</span>
        )}
      </div>

      {snapshot && darfBearbeiten && (
        <div className="weinbegleitung-umschalter" role="group" aria-label={t('artDerWeinbegleitung')}>
          {MODI.map((eintrag) => (
            <button
              key={eintrag.modus}
              type="button"
              className="weinbegleitung-umschalter-knopf"
              aria-pressed={snapshot.modus === eintrag.modus}
              disabled={Boolean(arbeit)}
              onClick={() => wein.modusWechseln(eintrag.modus)}
            >
              {t(eintrag.schluessel)}
            </button>
          ))}
        </div>
      )}

      {zeigtEinWeinImKopf(snapshot) && <EinWeinKopf wein={wein} icons={icons} />}

      {arbeit && (
        <p className="weinbegleitung-status" role="status">{arbeitText(arbeit, t)}</p>
      )}

      {!snapshot && darfBearbeiten && !arbeit && (
        <button type="button" className="weinbegleitung-knopf" onClick={wein.berechnen}>
          {t('weinbegleitungErstellen')}
        </button>
      )}

      {snapshot && veraltet && !arbeit && (
        <div className="weinbegleitung-veraltet">
          <p>{t('menueGeaendert')}</p>
          {darfBearbeiten && (
            <button type="button" className="weinbegleitung-knopf" onClick={wein.berechnen}>
              {t('neuBerechnen')}
            </button>
          )}
        </div>
      )}

      {fehler && <p className="weinbegleitung-fehler" role="alert">{fehler}</p>}
      {hinweis && <p className="weinbegleitung-hinweis">{hinweis}</p>}
    </section>
  );
}

function HinweisZeile({ gang, mitOptionen, icons }) {
  const t = useTexte(weinTexte);
  if (gang.hinweis === HINWEIS_KEIN_STIL) {
    return (
      <p className="weinbegleitung-gang-hinweis weinbegleitung-gang-hinweis--symbol">
        <WeinSymbol stil={null} icons={icons} groesse={22} />
        {t('keinStil')}.{mitOptionen && ` ${t('trotzdemWein')}`}
      </p>
    );
  }
  if (gang.hinweis === HINWEIS_KEIN_GEMEINSAMER_STIL) {
    return <p className="weinbegleitung-gang-hinweis">{t('keinStilFuerAlleProGang')}</p>;
  }
  if (gang.hinweis === HINWEIS_OHNE_PROFIL) {
    return <p className="weinbegleitung-gang-hinweis">{t('nochNichtEingeschaetzt')}</p>;
  }
  return null;
}

function Pfeil({ offen }) {
  return (
    <svg
      className={`weinbegleitung-pfeil${offen ? ' weinbegleitung-pfeil--offen' : ''}`}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/**
 * Eine Weinzeile: Stil mit Symbol (eingerichtetes Icon oder Glas), drei Rebsorten, Temperatur und
 * Label, darunter optional ein Zusatz („Am besten zu: …“). Antippen klappt den Inhalt (`children`)
 * auf. Die Rebsorten kommen, wo es sie gibt, aus der Weinregion der Küche (`regionId`, kulinarik.js).
 */
function OptionZeile({ stilId, label, istEmpfehlung = false, fixiert = false, zusatz = null, regionId = null, icons = null, offen, onUmschalten, children }) {
  const panelId = sichereId('weinbegleitung-option', useId());
  const t = useTexte(weinTexte);
  const { sprache } = useSprache();
  const stil = getStil(stilId);
  const { beispiele, region } = beispieleFuerRegion(stil, regionId, MENUE_BEISPIELE_JE_STIL);
  return (
    <li className={`weinbegleitung-option${istEmpfehlung ? ' weinbegleitung-option--empfehlung' : ''}`}>
      <button
        type="button"
        className="weinbegleitung-gang-zeile"
        aria-expanded={offen}
        aria-controls={panelId}
        onClick={onUmschalten}
      >
        <WeinSymbol stil={stil} icons={icons} groesse={22} />
        <span className="weinbegleitung-gang-text">
          <span className="weinbegleitung-gang-name">{stilName(stil, sprache)}</span>
          <span className="weinbegleitung-gang-details">
            {beispiele.map((beispiel) => beispielText(beispiel, sprache)).join(', ')} · <span className="weinbegleitung-nowrap">{formatTemperatur(stil)}</span>
          </span>
          <span className={`weinbegleitung-gang-label${label === LABEL_BEDINGT ? ' weinbegleitung-gang-label--bedingt' : ''}`}>
            {istEmpfehlung && `${t('empfehlung')} · `}
            {labelText(label, t)}
            {fixiert && <span className="weinbegleitung-fixiert"> · {t('fixiert')}</span>}
          </span>
          {zusatz && <span className="weinbegleitung-gang-zusatz">{zusatz}</span>}
        </span>
        <Pfeil offen={offen} />
      </button>

      {offen && (
        <div className="weinbegleitung-gang-panel" id={panelId}>
          {region && <p className="weinbegleitung-region">{t('beispielePassend', { region: regionName(region, sprache) })}</p>}
          {children}
        </div>
      )}
    </li>
  );
}

function FestlegenKnopf({ stil, onClick }) {
  const t = useTexte(weinTexte);
  const { sprache } = useSprache();
  return (
    <button
      type="button"
      className="weinbegleitung-link"
      aria-label={t('alsEmpfehlungFestlegenName', { stil: stilName(stil, sprache) })}
      onClick={onClick}
    >
      {t('alsEmpfehlungFestlegen')}
    </button>
  );
}

function LoesenKnopf({ onClick }) {
  const t = useTexte(weinTexte);
  return (
    <button type="button" className="weinbegleitung-link" onClick={onClick}>
      {t('fixierungLoesen')}
    </button>
  );
}

function amBestenZu(option, t, tFesttafel) {
  const beste = (option.besteGaenge || []).map((gang) => gang.sektionName).filter(Boolean);
  if (beste.length === 0 || beste.length >= (option.gaenge || []).length) return null;
  return t('amBestenZu', { gaenge: aufzaehlung(beste.map((name) => abschnittAnzeige(name, tFesttafel)), t) });
}

/**
 * Modus „Ein Wein für alles“ im Kopf: je eine Weiß- und eine Rotwein-Option für alle Gänge
 * (Empfehlung zuerst) mit dem Gang, zu dem sie am besten passt; aufgeklappt Label und Gründe
 * je Gang. Darunter der eigene Wein jedes Dessert-Gangs.
 */
function EinWeinKopf({ wein, icons }) {
  const [offen, setOffen] = useState(null);
  const t = useTexte(weinTexte);
  const tFesttafel = useTexte(festtafelTexte);
  const { snapshot } = wein;
  const umschalten = (schluessel) => setOffen((vorher) => (vorher === schluessel ? null : schluessel));
  const darfAendern = wein.darfBearbeiten && !wein.arbeit;
  const fixiert = Boolean(snapshot.gemeinsamerStilId)
    && snapshot.gemeinsamerStilId === snapshot.gewaehlterGemeinsamerStilId;
  const optionen = snapshot.einWeinOptionen.filter((option) => getStil(option.stilId));
  const desserts = snapshot.gaenge.filter((gang) => gang.istDessert && gang.stilId && getStil(gang.stilId));

  return (
    <>
      {optionen.length > 0 && (
        <ul className="weinbegleitung-optionen" aria-label={t('einWeinAlleGaengeLabel')}>
          {optionen.map((option) => {
            const istEmpfehlung = option.stilId === snapshot.gemeinsamerStilId;
            return (
              <OptionZeile
                key={option.stilId}
                stilId={option.stilId}
                label={option.label}
                istEmpfehlung={istEmpfehlung}
                fixiert={istEmpfehlung && fixiert}
                zusatz={amBestenZu(option, t, tFesttafel)}
                regionId={wein.regionMenue}
                icons={icons}
                offen={offen === option.stilId}
                onUmschalten={() => umschalten(option.stilId)}
              >
                <h3 className="weinbegleitung-abschnitt">{t('warumPasst')}</h3>
                {option.label === LABEL_BEDINGT && (
                  <p className="weinbegleitung-bedingt">{t('bedingtAlle')}</p>
                )}
                {(option.gaenge || []).map((gang) => (
                  <div key={`${gang.sektionIndex}-${gang.sektionName}`} className="weinbegleitung-gruende-gang">
                    <h4 className="weinbegleitung-gruende-gang-titel">
                      {t('gangMitLabel', {
                        gang: abschnittAnzeige(gang.sektionName, tFesttafel),
                        label: (
                          <span key="label" className={gang.label === LABEL_BEDINGT ? 'weinbegleitung-gang-label--bedingt' : undefined}>
                            {labelText(gang.label, t)}
                          </span>
                        ),
                      })}
                    </h4>
                    <Gruende regelIds={gang.regelIds} mitQuellen={false} />
                  </div>
                ))}
                {!istEmpfehlung && darfAendern && (
                  <FestlegenKnopf stil={getStil(option.stilId)} onClick={() => wein.alternativeWaehlen(null, option.stilId)} />
                )}
                {istEmpfehlung && fixiert && darfAendern && <LoesenKnopf onClick={() => wein.fixierungLoesen(null)} />}
              </OptionZeile>
            );
          })}
        </ul>
      )}

      {desserts.map((gang) => {
        const schluessel = `dessert-${gang.sektionIndex}`;
        const gangName = abschnittAnzeige(gang.sektionName, tFesttafel);
        return (
          <div key={schluessel} className="weinbegleitung-kopf-dessert">
            <p className="weinbegleitung-kopf-abschnitt">{gangName}</p>
            <ul className="weinbegleitung-optionen" aria-label={t('weinZu', { gang: gangName })}>
              <OptionZeile
                stilId={gang.stilId}
                label={gang.label}
                regionId={wein.regionFuer?.(gang.sektionIndex)}
                icons={icons}
                offen={offen === schluessel}
                onUmschalten={() => umschalten(schluessel)}
              >
                <h3 className="weinbegleitung-abschnitt">{t('warumPasst')}</h3>
                <Gruende regelIds={gang.regelIds} mitQuellen={false} />
              </OptionZeile>
            </ul>
          </div>
        );
      })}
    </>
  );
}

/** Weinzeile eines Gangs (Modus „Pro Gang“ und ältere Snapshots im Modus „Ein Wein“). */
function GangOptionZeile({ wein, gang, eintrag, icons, offen, onUmschalten, darfTauschen }) {
  const t = useTexte(weinTexte);
  const stil = getStil(eintrag.stilId);
  return (
    <OptionZeile
      stilId={eintrag.stilId}
      label={eintrag.label}
      istEmpfehlung={eintrag.istEmpfehlung}
      fixiert={eintrag.istEmpfehlung && gang.fixiert}
      regionId={wein.regionFuer?.(gang.sektionIndex)}
      icons={icons}
      offen={offen}
      onUmschalten={onUmschalten}
    >
      <h3 className="weinbegleitung-abschnitt">{t('warumPasst')}</h3>
      {eintrag.label === LABEL_BEDINGT && (
        <p className="weinbegleitung-bedingt">{t('bedingtGang')}</p>
      )}
      <Gruende regelIds={eintrag.regelIds} mitQuellen={false} />
      {!eintrag.istEmpfehlung && darfTauschen && (
        <FestlegenKnopf stil={stil} onClick={() => wein.alternativeWaehlen(gang, eintrag.stilId)} />
      )}
      {eintrag.istEmpfehlung && gang.fixiert && wein.darfBearbeiten && !wein.arbeit && (
        <LoesenKnopf onClick={() => wein.fixierungLoesen(gang)} />
      )}
    </OptionZeile>
  );
}

/**
 * Weine eines Gangs unter der Gang-Überschrift: die Empfehlung und je eine Rot- und
 * Weißwein-Option (Snapshot-Feld `optionen`), offen sichtbar. Gänge ohne Empfehlung zeigen
 * den Hinweis und, wo vorhanden, die Optionen. Im Modus „Ein Wein“ stehen die Weine im Kopf,
 * am Gang nur der Hinweis, wenn er ohne Wein bleibt.
 */
export function WeinbegleitungGang({ wein, sektionIndex, sektionName, icons = null }) {
  const [offenesStil, setOffenesStil] = useState(null);
  const t = useTexte(weinTexte);
  const tFesttafel = useTexte(festtafelTexte);
  if (!wein?.snapshot) return null;
  const gang = wein.gangFuer(sektionIndex, sektionName);
  if (!gang) return null;

  if (zeigtEinWeinImKopf(wein.snapshot)) {
    return gang.hinweis === HINWEIS_KEIN_STIL || gang.hinweis === HINWEIS_OHNE_PROFIL
      ? <HinweisZeile gang={gang} mitOptionen={false} icons={icons} />
      : null;
  }

  const darfTauschen = wein.darfBearbeiten && !wein.arbeit
    && !(wein.snapshot.modus === MODUS_EIN_WEIN && gang.istDessert);
  const eintraege = [
    ...(gang.stilId && getStil(gang.stilId)
      ? [{ stilId: gang.stilId, label: gang.label, regelIds: gang.regelIds, istEmpfehlung: true }]
      : []),
    ...(gang.optionen || [])
      .filter((option) => option.stilId !== gang.stilId && getStil(option.stilId))
      .map((option) => ({ ...option, istEmpfehlung: false })),
  ];
  const hinweis = gang.stilId ? null : <HinweisZeile gang={gang} mitOptionen={eintraege.length > 0} icons={icons} />;
  if (eintraege.length === 0) return hinweis;

  return (
    <div className="weinbegleitung-gang">
      {hinweis}
      <ul className="weinbegleitung-optionen" aria-label={t('weineZu', { gang: abschnittAnzeige(sektionName, tFesttafel) })}>
        {eintraege.map((eintrag) => (
          <GangOptionZeile
            key={eintrag.stilId}
            wein={wein}
            gang={gang}
            eintrag={eintrag}
            icons={icons}
            offen={offenesStil === eintrag.stilId}
            onUmschalten={() => setOffenesStil((vorher) => (vorher === eintrag.stilId ? null : eintrag.stilId))}
            darfTauschen={darfTauschen}
          />
        ))}
      </ul>
    </div>
  );
}
