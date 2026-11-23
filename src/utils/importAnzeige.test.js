import fs from 'fs';
import path from 'path';
import { erstelleT } from '../i18n/texte';
import rezeptimportTexte, { DIENST_MELDUNGEN, GESPEICHERTE_TEXTE } from '../i18n/texte/rezeptimport';
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
    expect(importTextAnzeige('No response from AI service', tEn)).toBe('No response from AI service');
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

describe('importTextAnzeige: Meldungen der Import-Dienste (Mehrsprachigkeit PR 6m)', () => {
  it('übersetzt Meldungen der Dienste, auch mit Werten', () => {
    expect(importTextAnzeige('Zeitüberschreitung. Bitte versuche es erneut.', tEn)).toBe('Timed out. Please try again.');
    expect(importTextAnzeige('Fehler beim Laden der Import-Seite (HTTP 503).', tFr)).toBe('Erreur lors du chargement de la page d’import (HTTP 503).');
    expect(importTextAnzeige('Ungültige Instagram-URL.', tEn)).toBe('Invalid Instagram URL.');
  });

  it('übersetzt die deutschen Meldungen der Cloud Functions mit ihrer Zahl', () => {
    expect(importTextAnzeige('Tageslimit erreicht (20/20 Scans). Versuche es morgen erneut oder nutze Standard-OCR.', tEn))
      .toBe('Daily limit reached (20/20 scans). Try again tomorrow or use standard OCR.');
  });

  it('übersetzt das Tageslimit der Anfragen und die Meldungen der KI-Berechtigung (PR 6p)', () => {
    expect(importTextAnzeige('Tageslimit erreicht (20/20 Anfragen). Versuche es morgen erneut.', tEn))
      .toBe('Daily limit reached (20/20 requests). Try again tomorrow.');
    expect(importTextAnzeige('Deiner Rolle fehlt die Berechtigung für diese Funktion.', tFr))
      .toBe('Ton rôle n’a pas l’autorisation pour cette fonction.');
    expect(importTextAnzeige('KI-Funktionen sind erst ab der Rolle „Bearbeiten“ verfügbar.', tEn))
      .toBe('AI features are only available from the “Edit” role upwards.');
  });

  it('übersetzt den Grund in einer zusammengesetzten Meldung', () => {
    const gespeichert = 'Die importierte Seite konnte nicht als Rezept verarbeitet werden. Tageslimit erreicht. Versuche es morgen erneut.';
    expect(importTextAnzeige(gespeichert, tEn)).toBe('The imported page couldn’t be processed as a recipe. Daily limit reached. Try again tomorrow.');
    // Ein unbekannter Grund bleibt, wie er ist
    expect(importTextAnzeige('Die importierte Seite konnte nicht als Rezept verarbeitet werden. Quota exceeded', tEn))
      .toBe('The imported page couldn’t be processed as a recipe. Quota exceeded');
  });

  it('übersetzt mehrzeilige Meldungen des CSV-Imports Zeile für Zeile', () => {
    const gemeldet = 'Fehler beim Importieren:\nZeile 3: Rezeptname fehlt\nZeile 5 (Suppe): Mindestens eine Zutat erforderlich';
    expect(importTextAnzeige(gemeldet, tEn)).toBe('Errors while importing:\nRow 3: recipe name missing\nRow 5 (Suppe): at least one ingredient required');
    expect(importTextAnzeige(gemeldet, tDe)).toBe(gemeldet);
  });

  it('kennt jede Meldung so, wie der Code sie meldet, auch die der Cloud Functions', () => {
    const quellen = [
      'utils/webImportService.js',
      'utils/aiOcrService.js',
      'utils/csvBulkImport.js',
      'utils/ocrParser.js',
      '../functions/handlers/importApp.js',
      '../functions/shared/gemini.js',
      '../functions/shared/auth.js',
    ].map((datei) => fs.readFileSync(path.join(__dirname, '..', datei), 'utf8')).join('\n');
    DIENST_MELDUNGEN.forEach((schluessel) => {
      rezeptimportTexte.de[schluessel].split(/\{\w+\}/).filter((teil) => teil.trim()).forEach((teil) => {
        expect({ schluessel, gefunden: quellen.includes(teil) }).toEqual({ schluessel, gefunden: true });
      });
    });
  });
});
