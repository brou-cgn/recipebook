# Machbarkeitstest: Word-Datei als Druckvorlage

Wegwerf-Code zum Vorhaben Drucklayout (`docs/vorhaben/drucklayout.md`, Abschnitt „Machbarkeitstest
Word-Vorlage“), 25.11.2026. Kein Teil der App: nichts davon wird gebaut, getestet oder ausgeliefert.
Er liegt hier, damit der Test wiederholbar bleibt, vor allem mit einer in Word bearbeiteten Vorlage.

Frage des Tests: Kann eine Word-Datei (.docx) die Druckvorlage sein, also herunterladen, in Word frei
umbauen, hochladen, und die App druckt Rezepte damit?

## Ablauf

```bash
# Arbeitsordner außerhalb des Repos, einmalig
mkdir -p /tmp/word-test && cd /tmp/word-test && npm init -y
npm install jszip @xmldom/xmldom sharp docx-preview   # playwright ist in der Cloud-Session vorhanden
T=<repo>/scripts/machbarkeit-word-vorlage
cp $T/fuellen.js $T/browser_darstellen.js .             # die Skripte laden ihre Pakete aus diesem Ordner

python3 $T/vorlage_erzeugen.py vorlagen                 # Startvorlage und eine frei angeordnete Variante
python3 $T/testdaten_erzeugen.py rezepte                # drei Rezepte, zwei Testfotos
node fuellen.js vorlagen/startvorlage-klassisch.docx rezepte/kurz.json gefuellt/start--kurz.docx

# Weg A: Umwandler (so liefe es auf einem Server)
soffice --headless --convert-to pdf --outdir pdf gefuellt/*.docx
# Weg B: Darstellung im Browser, ohne Server
node browser_darstellen.js gefuellt browser
```

Voraussetzungen: Python mit `python-docx` und Pillow, LibreOffice (`soffice`), Node, Playwright.

## Dateien

| Datei | Aufgabe |
|---|---|
| `vorlage_erzeugen.py` | baut zwei Word-Dateien mit Platzhaltern: die Startvorlage „Klassisch“ und eine frei angeordnete Variante (Textfeld, frei platziertes Foto, Kopf- und Fußzeile) als Stellvertreter für das, was in Word entsteht |
| `testdaten_erzeugen.py` | Rezepte (kurz, lang, ohne Foto) und Testfotos |
| `fuellen.js` | setzt ein Rezept in eine Vorlage ein: Felder, Blöcke `{zutaten}` und `{zubereitung}`, Fotos über den Alternativtext „Foto 1“ bis „Foto 4“ |
| `browser_darstellen.js` | zeichnet gefüllte Word-Dateien mit `docx-preview` im Browser, als Bild und als PDF aus dem Druckdialog |

## Platzhalter

Felder: `{titel}` `{autor_und_datum}` `{kulinarik}` `{zeit}` `{portionen}` `{schwierigkeit}`
`{zutaten_ueberschrift}`. Blöcke: `{zutaten}` und `{zubereitung}` stehen allein in einem Absatz; er wird je
Zeile wiederholt und gibt seine Formatierung weiter. Fotos: ein Bild mit dem Alternativtext „Foto 1“ (bis
„Foto 4“) behält Platz, Größe und Textumbruch und bekommt das Rezeptfoto.

Ergebnis und offene Punkte stehen im Tracker, nicht hier.
