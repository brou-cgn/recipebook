/**
 * Fehler aus Cloud-Function-Aufrufen vereinheitlichen. Eigene Datei, damit leichte
 * Module (z. B. webImportPin im Start-Bundle) nicht den ganzen Web-Import-Service
 * mitladen (Tech-Check P2).
 */

/**
 * Normalize Firebase callable errors so callers can handle both local test
 * stubs and production `functions/...` error codes consistently.
 *
 * @param {Error & {code?: string}} error - Error thrown by a callable function
 * @returns {{code: string, message: string, lowerMessage: string}}
 */
export function getCallableErrorDetails(error) {
  const rawCode = error?.code ? String(error.code) : '';
  const code = rawCode.replace(/^functions\//, '').toLowerCase();
  const message = error?.message ? String(error.message).trim() : '';
  const lowerMessage = message.toLowerCase();

  return { code, message, lowerMessage };
}
