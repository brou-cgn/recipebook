import { printRecipe } from './printRunner';
import { createPrintFormat } from '../utils/printFormats';

const recipe = { id: 'r', title: 'Testrezept', portionen: 2, ingredients: ['1 Ei'], steps: ['Kochen'] };

let printSpy;
let seenDuringPrint;

beforeEach(() => {
  seenDuringPrint = null;
  printSpy = jest.spyOn(window, 'print').mockImplementation(() => {
    seenDuringPrint = {
      root: document.getElementById('print-root'),
      pageRule: document.getElementById('print-page-format')?.textContent,
      bodyClass: document.body.classList.contains('ppv-printing'),
      title: document.querySelector('#print-root h1')?.textContent,
    };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  document.getElementById('print-root')?.remove();
  document.getElementById('print-page-format')?.remove();
  document.body.className = '';
});

const leftovers = () => ({
  root: document.getElementById('print-root'),
  style: document.getElementById('print-page-format'),
  bodyClass: document.body.classList.contains('ppv-printing'),
  printStyles: document.querySelectorAll('style[id^="print-"]').length,
});

describe('printRecipe', () => {
  test('renders the page into #print-root, sets @page in cm and calls window.print once', async () => {
    await printRecipe({ recipe, format: createPrintFormat(), servings: 2 });
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(seenDuringPrint.root).not.toBeNull();
    expect(seenDuringPrint.title).toBe('Testrezept');
    expect(seenDuringPrint.pageRule).toBe('@page { size: 21cm 29.7cm; margin: 0; }');
    expect(seenDuringPrint.bodyClass).toBe(true);
  });

  test('uses the format page size (landscape)', async () => {
    await printRecipe({ recipe, format: createPrintFormat('landscape') });
    expect(seenDuringPrint.pageRule).toContain('size: 29.7cm 21cm');
  });

  test('cleans up after afterprint and leaves no print styles or classes behind', async () => {
    await printRecipe({ recipe, format: createPrintFormat() });
    expect(leftovers().root).not.toBeNull();
    window.dispatchEvent(new Event('afterprint'));
    expect(leftovers()).toEqual({ root: null, style: null, bodyClass: false, printStyles: 0 });
  });

  test('does not touch the on-screen document while printing', async () => {
    const screenNode = document.createElement('div');
    screenNode.className = 'recipe-detail-content';
    document.body.appendChild(screenNode);
    const htmlStyleBefore = document.documentElement.getAttribute('style');
    await printRecipe({ recipe, format: createPrintFormat() });
    expect(screenNode.className).toBe('recipe-detail-content');
    expect(document.documentElement.getAttribute('style')).toBe(htmlStyleBefore);
    window.dispatchEvent(new Event('afterprint'));
    screenNode.remove();
  });

  test('the print container holds no interactive elements', async () => {
    await printRecipe({ recipe, format: createPrintFormat() });
    expect(seenDuringPrint.root.querySelectorAll('button, input, select, textarea, a')).toHaveLength(0);
    window.dispatchEvent(new Event('afterprint'));
  });

  test('fallback timer cleans up when afterprint never fires; double cleanup is harmless', async () => {
    jest.useFakeTimers();
    await printRecipe({ recipe, format: createPrintFormat() });
    expect(leftovers().root).not.toBeNull();
    jest.advanceTimersByTime(30000);
    expect(leftovers().root).toBeNull();
    expect(() => window.dispatchEvent(new Event('afterprint'))).not.toThrow();
    expect(leftovers().printStyles).toBe(0);
  });

  test('a late afterprint after the fallback does not break a following print', async () => {
    jest.useFakeTimers();
    await printRecipe({ recipe, format: createPrintFormat() });
    jest.advanceTimersByTime(30000);
    await printRecipe({ recipe, format: createPrintFormat() });
    expect(leftovers().root).not.toBeNull();
    window.dispatchEvent(new Event('afterprint'));
    expect(leftovers().root).toBeNull();
  });

  test('waits for images that are still loading (bounded by a timeout)', async () => {
    const withImage = { ...recipe, images: [{ url: 'x.jpg', isDefault: true }] };
    jest.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(false);
    jest.useFakeTimers();
    const promise = printRecipe({ recipe: withImage, format: createPrintFormat() });
    await Promise.resolve();
    expect(printSpy).not.toHaveBeenCalled();
    jest.advanceTimersByTime(5000);
    await promise;
    expect(printSpy).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('afterprint'));
  });

  test('iOS prints from a popup built from the print container', async () => {
    const popupDoc = { write: jest.fn(), close: jest.fn() };
    const popup = { document: popupDoc, focus: jest.fn(), print: jest.fn(), close: jest.fn() };
    jest.spyOn(window, 'open').mockReturnValue(popup);
    jest.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    await printRecipe({ recipe, format: createPrintFormat() });
    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect(popupDoc.write.mock.calls[0][0]).toContain('id="print-root"');
    expect(popupDoc.write.mock.calls[0][0]).toContain('Testrezept');
    expect(popup.print).toHaveBeenCalledTimes(1);
    expect(popup.close).toHaveBeenCalled();
    expect(printSpy).not.toHaveBeenCalled();
    expect(leftovers().root).toBeNull();
  });

  test('iOS with blocked popup alerts and prints nothing', async () => {
    jest.spyOn(window, 'open').mockReturnValue(null);
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    jest.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)');
    await printRecipe({ recipe, format: createPrintFormat() });
    expect(window.alert).toHaveBeenCalled();
    expect(printSpy).not.toHaveBeenCalled();
    expect(leftovers().root).toBeNull();
  });
});
