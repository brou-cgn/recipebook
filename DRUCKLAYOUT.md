# Druck-Layouts (Entwicklerdoku)

Rezepte werden über frei gestaltbare **Druckformate** gedruckt. Die Formate liegen zentral in
Firestore (`settings/app.printFormats`) und gelten für alle Nutzer. Bearbeitet werden sie in
den Einstellungen im Tab **Drucklayout**.

## Bausteine

| Datei | Aufgabe |
|---|---|
| `src/utils/printElements.js` | **Element-Registry**: IDs, Labels, Farben, Defaults für Hoch-/Querformat |
| `src/utils/printLayout.js` | reine Geometrie (cm/%, Rotation, Snap, CSS-Stil eines Elements) |
| `src/utils/printFormats.js` | Formatwahl, Migration auf v3, Validierung, Erzeugen/Duplizieren |
| `src/utils/printRecipe.js` | Rezeptdaten und Formulierungen für den Druck (eine Quelle) |
| `src/components/PrintPage.js` | **der** Renderer für Vorschau und Druck |
| `src/components/printElementRenderers.js` | ein Renderer pro Element |
| `src/components/printRunner.js` | Druckablauf (`#print-root`, `@page`, `window.print()`, Aufräumen) |
| `src/components/PrintFormatEditor.js` + `printEditor/` | WYSIWYG-Editor |
| `src/components/PrintFormatsSettings.js` | Formatliste, Speichern, Löschen mit Rückgängig |

`customLists.js` re-exportiert die Print-Namen aus Kompatibilitätsgründen.

## Datenmodell (layoutVersion 3)

```js
{
  id, name,
  maxPhotos,            // null = gilt für alle; sonst Format gilt bei Fotoanzahl <= maxPhotos
  orientation,          // 'portrait' | 'landscape' (aus Seitenmaßen abgeleitet)
  pageWidthCm, pageHeightCm,   // immer explizit, 5..200
  fontFamily,
  layoutVersion: 3,
  elements: [{ id, x, y, w, h, visible, rotation?, fontSizeScale?, fontBold?, ..., aspectRatio? }],
  migrationNotes?: ['legacy-layout-replaced']
}
```

**Koordinaten:** `x, y, w, h` sind ALLE Prozent der **Seitenbreite**. Für CSS wird `y`/`h`
mit `Breite/Höhe` auf Prozent der Seitenhöhe umgerechnet (`elementBox` in `printLayout.js`).

**Formatwahl:** `selectPrintFormat(formats, fotoanzahl)` nimmt unter den Formaten mit
`maxPhotos >= fotoanzahl` das mit dem kleinsten Wert (bei Gleichstand das zuerst gelistete).
Gibt es keins, gilt das Format ohne `maxPhotos`.

**Migration:** `migrateFormat` (v1 → v2 → v3) ist rein und idempotent und läuft beim **Lesen**.
Es wird nie automatisch zurückgeschrieben. Erst „Druckformate speichern" persistiert v3.
Vor dem ersten v3-Speichern wird der alte Stand einmalig in `settings/app.printFormatsBackup`
gesichert (Rollback: Inhalt zurück nach `printFormats` kopieren). v3 bleibt abwärtskompatibel
zu v2 (gleiche Koordinaten), ältere App-Versionen zeigen es weiter korrekt an.

**Validierung** (`validatePrintFormats`, blockiert das Speichern): mindestens ein Format
ohne `maxPhotos`, Name nicht leer, `maxPhotos` eindeutig und ganzzahlig ≥ 0, Seitenmaße
5–200 cm, Format ≤ 8 KB.

## Druckablauf

1. `RecipeDetail.handlePrint` wählt das Format und ruft `printRecipe(...)`.
2. `printRunner` rendert `<PrintPage mode="print">` in `#print-root` (am Bildschirm
   `display: none`), setzt `@page { size: B cm H cm; margin: 0 }`, wartet auf Schriften
   und Bilder und ruft `window.print()`.
3. Nach `afterprint` (Fallback 30 s) wird alles entfernt. Das Bildschirm-DOM wird nie verändert.
4. `PrintPage.css` blendet im Druck alles außer `#print-root` aus.

iOS: Das Popup wird synchron im Klick geöffnet und aus `#print-root` befüllt.

Die Seite wird in echter Größe (cm) gelayoutet. Die Vorschau skaliert sie nur per
`transform`, deshalb stimmen Umbrüche und Überlauf mit dem Druck überein.
Text, der nicht in seine Box passt, wird abgeschnitten. In der Vorschau zeigt ein Badge
„abgeschnitten" das an. Mehrseitiger Druck ist nicht umgesetzt.

## Neues Element hinzufügen

1. Eintrag in `PRINT_FORMAT_ELEMENTS` und Defaults in `DEFAULT_PRINT_ELEMENTS_PORTRAIT` und
   `..._LANDSCAPE` (`printElements.js`). Neue Elemente standardmäßig `visible: false`, damit
   gespeicherte Formate unverändert aussehen.
2. Renderer in `PRINT_ELEMENT_RENDERERS` (`printElementRenderers.js`). Ein Test stellt sicher,
   dass jede Registry-ID genau einen Renderer hat.
3. Snapshot-Test in `printElements.test.js` aktualisieren (`-u`) und die Änderung bewusst prüfen.

Editor, Vorschau, Druck und Settings brauchen keine Änderung.
