# Multi-Image Import für Instagram-Rezepte

## Feature-Beschreibung

Ermöglicht das gleichzeitige Hochladen mehrerer Screenshots von Instagram-Posts, um alle Rezeptinformationen (Bild, Caption, Kommentare) automatisch zu kombinieren.

## Verwendung

### Schritt 1: Screenshots erstellen
1. **Instagram Post öffnen**
2. **Screenshot 1**: Rezeptbild + Caption
3. **Screenshot 2**: Kommentarbereich scrollen + Screenshot
4. **Screenshot 3** (optional): Weitere Kommentare

### Schritt 2: In RecipeBook importieren
1. **"+ Rezept hinzufügen"** klicken
2. **"📁 Bild(er) hochladen"** wählen
3. **Alle Screenshots auswählen** (Strg/Cmd + Klick)
4. **Warten** während OCR alle Bilder verarbeitet
5. **Ergebnis prüfen** - alle Infos sind kombiniert!

## Technische Details

### Duplikat-Erkennung
- Verwendet Levenshtein-Distanz
- Ähnlichkeit > 80% = Duplikat
- Behält die erste Variante

### Merge-Strategie
- **Titel**: Vom ersten Bild
- **Zutaten**: Alle Bilder kombiniert, Duplikate entfernt
- **Schritte**: Alle Bilder kombiniert, Duplikate entfernt
- **Meta-Daten**: Erstes vollständiges Ergebnis gewinnt

### Batch-Processing
- Sequentielle Verarbeitung (ein Bild nach dem anderen)
- Fortschrittsanzeige für jedes Bild
- Fehlerbehandlung pro Bild (fehlerhafte werden übersprungen)

## Beispiel-Workflow

```
Instagram Post mit 150 Zeilen Text:
├── Screenshot 1: Titel + erste 50 Zeilen
├── Screenshot 2: Zeilen 51-100 (Kommentare)
└── Screenshot 3: Zeilen 101-150 (mehr Kommentare)

↓ OCR + AI Processing ↓

Vollständiges Rezept:
✓ Titel erkannt
✓ 12 Zutaten (aus allen 3 Bildern)
✓ 8 Schritte (aus allen 3 Bildern)
✓ 0 Duplikate
```

## Tipps

### Beste Ergebnisse
✅ Screenshots in chronologischer Reihenfolge benennen
✅ Gute Beleuchtung beim Screenshot
✅ Hochformat bevorzugt
✅ Maximal 5 Bilder gleichzeitig

### Häufige Probleme
❌ Zu viele Bilder (>10) → Langsam
❌ Unscharfe Screenshots → Schlechte OCR-Qualität
❌ Unterschiedliche Sprachen → Inkonsistente Ergebnisse

## Kompatibilität

- ✅ Desktop: Chrome, Firefox, Safari, Edge
- ✅ Mobile: iOS Safari, Chrome Mobile
- ✅ AI OCR (Gemini Vision)
- ✅ Standard OCR (Tesseract)

## Hinweise

### Wichtig
- **Rate Limits**: AI OCR hat Tageslimits (20/Tag User, 5/Tag Gast)
- **Performance**: Jedes Bild dauert 2-5 Sekunden
- **Duplikate**: Merge ist nicht perfekt, manuelle Prüfung empfohlen

### Zukünftige Erweiterungen
1. **Smart Ordering**: AI erkennt automatisch richtige Reihenfolge
2. **Audio Support**: Kombination mit Reel-Transkripten
3. **URL Import**: Direkt von Instagram URL alle Quellen laden
