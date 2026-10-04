import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import PrintPage from './PrintPage';
import { getPageSize } from '../utils/printLayout';

const ROOT_ID = 'print-root';
const PAGE_STYLE_ID = 'print-page-format';
const BODY_CLASS = 'ppv-printing';
const CLEANUP_FALLBACK_MS = 30000;
const IMAGE_TIMEOUT_MS = 5000;
const FONT_TIMEOUT_MS = 2000;

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);

/** Resolves when every <img> in the container has loaded (or failed), or after the timeout. */
function waitForImages(container, ms = IMAGE_TIMEOUT_MS) {
  const pending = Array.from(container.querySelectorAll('img'))
    .filter((img) => !img.complete)
    .map((img) => new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    }));
  return pending.length === 0 ? Promise.resolve() : withTimeout(Promise.all(pending), ms);
}

const isIOS = () =>
  typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

/**
 * Prints a recipe on a print format.
 *
 * Renders <PrintPage mode="print"> into a detached #print-root container, sets a
 * single @page rule (size in cm), waits for fonts and images and opens the print
 * dialog. Everything is removed again afterwards; the on-screen UI is never touched.
 *
 * @param {object} options
 * @param {object} options.recipe
 * @param {object} options.format   print format (already selected)
 * @param {number} [options.servings]
 * @param {string} [options.authorName]
 * @param {string} [options.portionLabel]
 * @returns {Promise<void>} resolves once the print dialog was handed over to the browser
 */
export async function printRecipe({ recipe, format, servings, authorName, portionLabel }) {
  // iOS needs the popup to be opened synchronously inside the click handler.
  const popup = isIOS() ? window.open('', '_blank') : null;
  if (isIOS() && !popup) {
    alert('Bitte erlaube Popups für diese Seite, um das Rezept zu drucken.');
    return;
  }

  const container = document.createElement('div');
  container.id = ROOT_ID;
  document.body.appendChild(container);
  const root = createRoot(container);

  const { widthCm, heightCm } = getPageSize(format);
  const pageStyle = document.createElement('style');
  pageStyle.id = PAGE_STYLE_ID;
  pageStyle.textContent = `@page { size: ${widthCm}cm ${heightCm}cm; margin: 0; }`;
  document.head.appendChild(pageStyle);
  document.body.classList.add(BODY_CLASS);

  let cleaned = false;
  let fallbackTimer = null;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearTimeout(fallbackTimer);
    window.removeEventListener('afterprint', cleanup);
    root.unmount();
    container.remove();
    pageStyle.remove();
    document.body.classList.remove(BODY_CLASS);
  };

  flushSync(() => {
    root.render(
      <PrintPage
        mode="print"
        recipe={recipe}
        format={format}
        servings={servings}
        authorName={authorName}
        portionLabel={portionLabel}
      />,
    );
  });

  try {
    if (document.fonts?.ready) await withTimeout(document.fonts.ready, FONT_TIMEOUT_MS);
    await waitForImages(container);
  } catch (e) {
    // Fonts or images failing must not block printing.
  }

  if (popup) {
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((el) => el.outerHTML)
      .join('\n');
    popup.document.write(
      `<html><head>${styles}</head><body class="${BODY_CLASS}">${container.outerHTML}</body></html>`,
    );
    popup.document.close();
    popup.focus();
    popup.print();
    popup.close();
    cleanup();
    return;
  }

  window.addEventListener('afterprint', cleanup, { once: true });
  fallbackTimer = setTimeout(cleanup, CLEANUP_FALLBACK_MS);
  window.print();
}
