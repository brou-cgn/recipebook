/**
 * Persönliche Wichtel-Links: /wichteln/{rundeId}/{token}
 * (oder #wichteln/{rundeId}/{token}, wie bei den Freigabelinks).
 * Das Token ist die Berechtigung des Teilnehmers; es entsteht serverseitig
 * (functions/wichteln.js, 24 Zufallsbytes als base64url).
 *
 * /wichteln ohne Runde und Token ist dagegen der Direktlink für Organisatoren
 * (istWichtelSeitenPfad): Er öffnet nach der Anmeldung Events > Wichteln.
 */
import { normalizeGuestLanguage } from './guestPreferences';

const PFAD_PREFIX = '/wichteln/';
const HASH_PREFIX = '#wichteln/';
// Groß-/Kleinschreibung egal: In deutschen Texten steht der Link gern als „/Wichteln“.
const SEITEN_PFAD = /^\/wichteln\/?$/i;
const RUNDE_ID = /^[A-Za-z0-9]{10,40}$/;
const TOKEN = /^[A-Za-z0-9_-]{32}$/;

/**
 * Erkennt einen Wichtel-Link in Pfad oder Hash. Jede Adresse unter /wichteln/
 * gilt als Wichtel-Link, auch eine kaputte (z. B. abgeschnitten kopiert): dann ist
 * `gueltig` false, damit die Seite „Link ungültig“ zeigt statt der Anmeldung.
 * Ausnahme: /wichteln/ ohne etwas dahinter ist die Seite der Organisatoren.
 * @param {{pathname?: string, hash?: string}} location
 * @returns {{rundeId: string, token: string, gueltig: boolean}|null}
 */
export function parseWichtelLink({ pathname = '', hash = '' } = {}) {
  let rest = null;
  if (pathname.startsWith(PFAD_PREFIX)) rest = pathname.slice(PFAD_PREFIX.length);
  else if (hash.startsWith(HASH_PREFIX)) rest = hash.slice(HASH_PREFIX.length);
  if (rest === null) return null;
  const teile = rest.split('/').filter(Boolean);
  if (teile.length === 0) return null;
  const [rundeId = '', token = ''] = teile;
  return {
    rundeId,
    token,
    gueltig: teile.length === 2 && RUNDE_ID.test(rundeId) && TOKEN.test(token),
  };
}

/**
 * Direktlink zur Wichtel-Seite der Organisatoren (Runden anlegen und verwalten):
 * broubook.web.app/wichteln, auch mit Schrägstrich am Ende oder großem W.
 * @param {string} [pathname]
 * @returns {boolean}
 */
export function istWichtelSeitenPfad(pathname = '') {
  return SEITEN_PFAD.test(pathname);
}

/**
 * @param {string} rundeId
 * @param {string} token
 * @param {string} [origin] - Standard: die Adresse, unter der die App gerade läuft
 * @returns {string}
 */
export function buildWichtelLink(rundeId, token, origin = window.location.origin) {
  return `${origin}${PFAD_PREFIX}${rundeId}/${token}`;
}

// Französische Typografie: geschütztes Leerzeichen innerhalb « » und vor dem Doppelpunkt.
const NBSP = '\u00A0';

/**
 * Teilen-Text je Sprache aus dem Gästeprofil (Feld `sprache`). Die Mail-Vorlagen in denselben
 * Sprachen stehen in functions/wichtelMail.js.
 */
const EINLADUNG = {
  de: {
    titel: (titel) => `Wichteln: ${titel}`,
    zeilen: ({ name, titel, link }) => [
      `Hallo ${name},`,
      `hier ist dein persönlicher Wichtel-Link für „${titel}“. Dort ziehst du dein Los, trägst deine Wünsche ein und kannst Geschenkideen für die anderen hinterlassen:`,
      link,
      'Bitte nicht weitergeben – der Link ist nur für dich.',
    ],
  },
  en: {
    titel: (titel) => `Secret Santa: ${titel}`,
    zeilen: ({ name, titel, link }) => [
      `Hi ${name},`,
      `Here is your personal Secret Santa link for “${titel}”. Use it to draw a name, add your wishes and leave gift ideas for the others:`,
      link,
      'Please don’t share it – this link is just for you.',
    ],
  },
  fr: {
    titel: (titel) => `Père Noël secret${NBSP}: ${titel}`,
    zeilen: ({ name, titel, link }) => [
      `Bonjour ${name},`,
      `Voici ton lien personnel pour le Père Noël secret «${NBSP}${titel}${NBSP}». Tu peux y tirer au sort la personne à qui tu offriras un cadeau, noter tes souhaits et laisser des idées de cadeaux pour les autres${NBSP}:`,
      link,
      'Merci de ne pas le partager – ce lien t’est réservé.',
    ],
  },
};

/**
 * Nachricht für den Teilnehmer (Messenger, Mail) in seiner Sprache.
 * @param {{name: string, titel: string, link: string, sprache?: string}} params - sprache:
 *   'de' | 'en' | 'fr' aus dem Gästeprofil, sonst Deutsch
 * @returns {string}
 */
export function buildWichtelEinladung({ name, titel, link, sprache }) {
  return EINLADUNG[normalizeGuestLanguage(sprache)].zeilen({ name, titel, link }).join('\n');
}

async function kopiere(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Ältere Browser ohne Clipboard-API
    try {
      const feld = document.createElement('textarea');
      feld.value = text;
      feld.setAttribute('readonly', '');
      feld.style.position = 'fixed';
      feld.style.opacity = '0';
      document.body.appendChild(feld);
      feld.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(feld);
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Teilt die Einladung über das Teilen-Menü des Geräts (Handy) oder kopiert sie.
 * @param {{name: string, titel: string, link: string, sprache?: string}} params
 * @returns {Promise<'geteilt'|'kopiert'|'abgebrochen'|'fehler'>}
 */
export async function teileWichtelEinladung({ name, titel, link, sprache }) {
  const text = buildWichtelEinladung({ name, titel, link, sprache });
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      // Link nur im Text: manche Ziele (z. B. Messenger) verwerfen sonst den Text.
      await navigator.share({ title: EINLADUNG[normalizeGuestLanguage(sprache)].titel(titel), text });
      return 'geteilt';
    } catch (error) {
      if (error?.name === 'AbortError') return 'abgebrochen';
      // andere Fehler: kopieren
    }
  }
  return (await kopiere(text)) ? 'kopiert' : 'fehler';
}
