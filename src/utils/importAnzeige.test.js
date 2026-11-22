import fs from 'fs';
import path from 'path';
import { erstelleT } from '../i18n/texte';
import rezeptimportTexte, { GESPEICHERTE_TEXTE } from '../i18n/texte/rezeptimport';
import { importTextAnzeige } from './importAnzeige';

const tDe = erstelleT(rezeptimportTexte, 'de');
const tEn = erstelleT(rezeptimportTexte, 'en');
const tFr = erstelleT(rezeptimportTexte, 'fr');

describe('importTextAnzeige (Mehrsprachigkeit PR 6i)', () => {
  it('lässt Deutsch, wie es gespeichert ist', () => {
    ['Foto-Scan', 'Foto-Scan (3 Bilder)', 'Analysiere Website...', 'Import fehlgeschlagen'].forEach((text) => {
      expect(importTextAnzeige(text, tDe)).toBe(text);
    });
  });

  it('übersetzt gespeicherte Bezeichnungen und Fehler, auch mit Anzahl', () => {
    expect(importTextAnzeige('Foto-Scan (3 Bilder)', tEn)).toBe('Photo scan (3 images)');
    expect(importTextAnzeige('Analysiere 2 Bilder...', tEn)).toBe('Analysing 2 images…');
    expect(importTextAnzeige('Lade Website...', tFr)).toBe('Chargement du site…');
    expect(importTextAnzeige('Import fehlgeschlagen', tFr)).toBe('Échec de l’import');
  });

  it('lässt Unbekanntes, wie es ist', () => {
    expect(importTextAnzeige('https://example.com/rezept', tEn)).toBe('https://example.com/rezept');
    expect(importTextAnzeige('Zeitüberschreitung. Bitte versuche es erneut.', tEn)).toBe('Zeitüberschreitung. Bitte versuche es erneut.');
    expect(importTextAnzeige(undefined, tEn)).toBeUndefined();
  });

  it('kennt jeden Text so, wie der Code ihn speichert', () => {
    const quellen = [
      'utils/importRunners.js',
      'components/OcrScanModal.js',
      'components/UniversalImportModal.js',
      'contexts/RecipeImportQueueContext.js',
    ].map((datei) => fs.readFileSync(path.join(__dirname, '..', datei), 'utf8')).join('\n');
    GESPEICHERTE_TEXTE.forEach((schluessel) => {
      rezeptimportTexte.de[schluessel].split(/\{\w+\}/).filter(Boolean).forEach((teil) => {
        expect({ schluessel, gefunden: quellen.includes(teil) }).toEqual({ schluessel, gefunden: true });
      });
    });
  });
});
