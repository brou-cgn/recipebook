import { useState } from 'react';
import './WichtelLinkKarte.css';
import ExternalLinkIcon from './icons/ExternalLinkIcon';
import LinkIcon from './icons/LinkIcon';

/**
 * Nur http/https wird zum Link. Der Server lässt nichts anderes zu; die Prüfung hier
 * schützt zusätzlich vor javascript:-Adressen in alten oder fremden Daten.
 * @param {*} url
 * @returns {string|null}
 */
export function sichererLink(url) {
  if (typeof url !== 'string') return null;
  try {
    const adresse = new URL(url);
    return adresse.protocol === 'https:' || adresse.protocol === 'http:' ? adresse.href : null;
  } catch {
    return null;
  }
}

/** Seitenname zur Anzeige: Host ohne „www.“. */
export function seitenName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

/**
 * Link eines Wichtel-Eintrags mit Vorschau: Bild links, Titel und Seite rechts.
 * Die Vorschau holt der Server beim Speichern (functions/linkVorschau.js). Das Bild
 * lädt der Browser direkt von der Seite des Shops, ohne Referrer (die Adresse der
 * Teilnehmerseite enthält das geheime Token). Fehlt das Bild oder lädt es nicht,
 * steht dort ein Link-Symbol.
 *
 * @param {Object} props
 * @param {string} props.url
 * @param {{bild?: string|null, titel?: string|null, seite?: string|null}|null} [props.vorschau]
 */
function WichtelLinkKarte({ url, vorschau }) {
  const [bildFehlt, setBildFehlt] = useState(false);
  const href = sichererLink(url);
  if (!href) return null;
  const bild = !bildFehlt && typeof vorschau?.bild === 'string' && vorschau.bild.startsWith('https://')
    ? vorschau.bild
    : null;
  const seite = vorschau?.seite || seitenName(href);

  return (
    <a className="wichtel-linkkarte" href={href} target="_blank" rel="noopener noreferrer nofollow">
      <span className={`wichtel-linkkarte-bild${bild ? '' : ' wichtel-linkkarte-bild--leer'}`} aria-hidden="true">
        {bild ? (
          <img
            src={bild}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            draggable="false"
            onError={() => setBildFehlt(true)}
            // 1×1-Platzhalter (Zählpixel) zählen nicht als Bild.
            onLoad={(e) => { if (e.currentTarget.naturalWidth < 2) setBildFehlt(true); }}
          />
        ) : (
          <LinkIcon size={22} />
        )}
      </span>
      <span className="wichtel-linkkarte-text">
        {vorschau?.titel && <span className="wichtel-linkkarte-titel">{vorschau.titel}</span>}
        <span className="wichtel-linkkarte-seite">
          <span className="wichtel-linkkarte-host">{seite}</span>
          <span className="wichtel-linkkarte-pfeil" aria-hidden="true"><ExternalLinkIcon size={12} /></span>
          <span className="wichtel-linkkarte-sr">(öffnet in neuem Tab)</span>
        </span>
      </span>
    </a>
  );
}

export default WichtelLinkKarte;
