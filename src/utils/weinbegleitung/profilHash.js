/**
 * inputHash des Gericht-Profils im Client. Die Eingabe muss Zeichen für Zeichen der
 * Cloud Function entsprechen (functions/shared/weinprofil.js, weinprofilHashEingabe);
 * profilHash.test.js prüft das. Damit erkennt die App ein veraltetes Profil, ohne die
 * Function zu fragen: Anzeigen löst nie einen KI-Aufruf aus.
 *
 * `updatedAt` taugt dafür nicht, weil es auch Freigabe und Vorschaubild setzen.
 */
import { SCHEMA_VERSION, normalisiereWeinprofil } from './profilSchema';

export const HASH_KENNUNG = 'weinprofil-v1';

const eintragText = (eintrag) => {
  if (typeof eintrag === 'string') return eintrag.trim();
  if (eintrag && typeof eintrag.text === 'string') return eintrag.text.trim();
  return '';
};

const eintragTexte = (liste) => (Array.isArray(liste) ? liste : []).map(eintragText).filter(Boolean);

const sortierteWerte = (wert) => (Array.isArray(wert) ? wert : [wert])
  .filter((eintrag) => typeof eintrag === 'string')
  .map((eintrag) => eintrag.trim())
  .filter(Boolean)
  .sort();

/**
 * Eingabe des inputHash: Titel, Zutaten-Texte, Schritte, Speisekategorie, Kulinarik.
 * @param {Object} rezept
 * @returns {string}
 */
export function weinprofilHashEingabe(rezept) {
  return JSON.stringify([
    HASH_KENNUNG,
    typeof rezept?.title === 'string' ? rezept.title.trim() : '',
    eintragTexte(rezept?.ingredients),
    eintragTexte(rezept?.steps),
    sortierteWerte(rezept?.speisekategorie),
    sortierteWerte(rezept?.kulinarik),
  ]);
}

/**
 * sha256 eines Textes als Hex, über die Web Crypto API.
 * @param {string} text
 * @param {{subtle?: SubtleCrypto}} [optionen] - für Tests austauschbar
 * @returns {Promise<string>}
 */
export async function sha256Hex(text, { subtle = globalThis.crypto?.subtle } = {}) {
  if (!subtle) throw new Error('SHA-256 ist in dieser Umgebung nicht verfügbar');
  const bytes = new TextEncoder().encode(text);
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * sha256 der Hash-Eingabe als Hex.
 * @param {Object} rezept
 * @param {{subtle?: SubtleCrypto}} [optionen] - für Tests austauschbar
 * @returns {Promise<string>}
 */
export async function weinprofilInputHash(rezept, optionen = {}) {
  return sha256Hex(weinprofilHashEingabe(rezept), optionen);
}

/**
 * Hat das Rezept ein gültiges Profil zum aktuellen Inhalt?
 * @param {Object} rezept - Rezept mit optionalem Feld weinprofil
 * @param {{subtle?: SubtleCrypto}} [optionen]
 * @returns {Promise<boolean>} false ohne Profil, bei anderer schemaVersion oder geändertem Inhalt
 */
export async function istWeinprofilAktuell(rezept, optionen) {
  const profil = rezept?.weinprofil;
  if (!profil || profil.schemaVersion !== SCHEMA_VERSION || !normalisiereWeinprofil(profil)) return false;
  return profil.inputHash === await weinprofilInputHash(rezept, optionen);
}
