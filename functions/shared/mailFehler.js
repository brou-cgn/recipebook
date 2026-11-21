/**
 * Fehler beim Mailversand ohne personenbezogene Daten (Tech-Check S27).
 *
 * nodemailer-Fehler tragen Empfängeradressen gleich mehrfach: in `rejected`,
 * `rejectedErrors[].recipient` und meist auch in `message` (die Antwort des
 * Mailservers, z. B. „550 5.1.1 <adresse>: Recipient address rejected“). Cloud
 * Logging hält alles, was eine Function ausgibt (AGENTS.md: keine E-Mail-Adressen
 * in Logs). Deshalb gelangen von einem Versandfehler nur Code, responseCode und
 * command in Logs oder weiter nach oben. Erzwungen durch logPolicy.test.js.
 */

/**
 * Nur Codes, nie die Meldung.
 * @param {*} err - Fehler aus transporter.sendMail
 * @return {string} z. B. „EENVELOPE 550 RCPT TO“, sonst „unbekannt“
 */
function mailFehlerCode(err) {
  return [err?.code, err?.responseCode, err?.command].filter(Boolean).join(' ') || 'unbekannt';
}

/**
 * Ersatz für einen Versandfehler, der weitergeworfen wird: gleiche Codes, keine Adressen.
 * @param {*} err - Fehler aus transporter.sendMail
 * @return {Error} Fehler mit code, responseCode und command des Originals
 */
function mailVersandFehler(err) {
  const ersatz = new Error(`Mailversand fehlgeschlagen (${mailFehlerCode(err)})`);
  for (const feld of ['code', 'responseCode', 'command']) {
    if (err?.[feld] !== undefined) ersatz[feld] = err[feld];
  }
  return ersatz;
}

module.exports = {mailFehlerCode, mailVersandFehler};
