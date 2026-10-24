/**
 * Von mehreren Function-Gruppen genutzte Helfer (aus index.js, Tech-Check F2).
 */

/**
 * Trusted origins allowed for CORS on API endpoints.
 * Server-to-server callers (e.g. Apple Shortcuts) send no Origin header and
 * are therefore unaffected by this list.
 * Localhost origins are included for local development.
 */
const ALLOWED_ORIGINS = [
  'https://broubook.web.app',
  'https://broubook.firebaseapp.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
];

/**
 * Escape HTML special characters to prevent XSS in email HTML body.
 * @param {string} str - Raw string to escape
 * @return {string} HTML-escaped string
 */
function escapeHtml(str) {
  return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
}

module.exports = {ALLOWED_ORIGINS, escapeHtml};
