/**
 * sha256 eines Textes als Hex, über die Web Crypto API. Gemeinsam genutzt von den Hashes, die
 * Client und Cloud Function gleich bilden müssen (Weinprofil: src/utils/weinbegleitung/profilHash.js,
 * Inhaltsübersetzung: src/i18n/rezeptInhalt.js).
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
