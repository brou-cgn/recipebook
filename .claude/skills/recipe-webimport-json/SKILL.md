---
name: recipe-webimport-json
description: Wandelt einen Rezepttext (Titel, Zutaten, Zubereitung, ggf. Beschreibung/Notizen) in das exakte JSON-Format um, das die Firebase Cloud Function `addRecipeViaAPI` des RecipeBook-Webimports erwartet, plus ein fertiges curl-Kommando-Template dafür. Nutze diesen Skill IMMER, wenn im Chat ein Rezept eingefügt oder diktiert wird und erkennbar ist, dass es ins RecipeBook importiert werden soll — auch ohne dass die Begriffe "JSON", "addRecipeViaAPI", "Kurzbefehl" oder "Webimport" fallen, z. B. bei "importier mir das", "mach mir daraus ein RecipeBook-Rezept", "gib mir das für den Kurzbefehl" oder einfach beim Einfügen von Titel+Zutaten+Zubereitung ohne weitere Erklärung. Gilt für Text, der direkt im Chat steht, per Foto/Video transkribiert wurde, oder über einen Apple Kurzbefehl an Claude geschickt wurde.
---

# Rezept → addRecipeViaAPI-JSON

## Warum dieser Skill existiert

RecipeBook hat einen Cloud-Function-Endpunkt (`addRecipeViaAPI`, siehe
`functions/index.js`, Validierung in `validateAndNormaliseRecipeInput`),
der ein Rezept als JSON entgegennimmt und **sofort** speichert — kein
Scraping, kein KI-Umweg über die Review-Queue. Der Endpunkt ist streng:
falsche Feldnamen oder ein leeres Pflichtfeld führen zu HTTP 400. Dieser
Skill sorgt dafür, dass das JSON beim ersten Versuch passt, egal wie
unstrukturiert der Ausgangstext ist (Fließtext, Kochbuch-Diktat,
Instagram-Caption, handschriftliche Notiz-Transkription).

Der Skill ruft die Cloud Function **nie selbst auf** — dafür fehlt ihm der
`SHORTCUT_API_KEY` und die registrierte E-Mail des Nutzers. Er liefert nur
das fertige JSON (und optional ein curl-Template), das der Nutzer selbst
per Kurzbefehl, curl oder in der App weiterverwendet.

## Das Zielschema

| Feld (kanonisch) | Akzeptierte Alias-Namen | Typ | Pflicht |
|---|---|---|---|
| `title` | `titel` | string | ✅ |
| `ingredients` | `zutaten` | string[] | ✅ |
| `steps` | `zubereitung` | string[] | ✅ |
| `portionen` | `servings`, `portions` | number | – |
| `kochdauer` | `cookTime`, `prepTime`, `zubereitungszeit` | number (Minuten) | – |
| `schwierigkeit` | `difficulty` | number (1–5) | – |
| `speisekategorie` | `category`, `kategorie` | string | – |
| `kulinarik` | `cuisine`, `kulinarisch` | string \| string[] | – |
| `tags` | – | string[] (oder komma-getrennter String) | – |
| `notizen` | `notes` | string | – |

Verwende im Output immer die **kanonischen deutschen Feldnamen** aus der
linken Spalte (nicht die Aliase) — das ist konsistent mit dem
Beispiel-JSON in `APPLE_SHORTCUT_SETUP.md` und leichter lesbar für den
Nutzer.

**Wichtig:** Es gibt kein eigenes `description`/`beschreibung`-Feld im
Schema. Eine im Ausgangstext vorhandene Kurzbeschreibung gehört an den
**Anfang von `notizen`**, getrennt durch eine Leerzeile von etwaigen
weiteren Notizen/Tipps:

```
"notizen": "<Beschreibung>\n\n<weitere Notizen, falls vorhanden>"
```

## Warum die Zutaten-Normalisierung wichtig ist

`addRecipeViaAPI` hat **keinen eigenen KI-Normalisierungsschritt** — anders
als der Foto-/Video-Scan-Import der App, der Rezepte über einen Gemini-Prompt
laufen lässt, der Einheiten vereinheitlicht, Brüche in Dezimalzahlen wandelt
und US-Maße in metrische umrechnet (siehe `aiRecipePrompt` in
`src/utils/customLists.js`). Wenn dieser Skill diese Normalisierung nicht
selbst übernimmt, sehen per `addRecipeViaAPI` importierte Rezepte anders aus
als alle anderen im RecipeBook — uneinheitliche Abkürzungen, Brüche statt
Dezimalzahlen, cups/oz statt g/ml. Die folgenden Regeln spiegeln genau die
Normalisierung, die der interne Prompt vorschreibt, damit das Ergebnis
unabhängig vom Importweg gleich aussieht.

## Umwandlungsregeln

1. **Zutaten als Array, normalisiert**: eine Zutat pro Element, im Format
   `"Zahl Einheit Zutat"` (z. B. "500 g Mehl", "2 Esslöffel Olivenöl", "1
   Prise Salz"). Dabei:
   - Einheiten **immer ausschreiben**, nie abkürzen: "Esslöffel" statt
     "EL", "Teelöffel" statt "TL", "g" (nicht "Gramm"), "ml" (nicht
     "Milliliter").
   - Brüche in Dezimalzahlen mit **Komma** umwandeln: "1/2" → "0,5", "1
     1/2" → "1,5".
   - **Imperiale Einheiten immer in metrische umrechnen**, mit diesen
     Umrechnungen: 1 cup (Flüssigkeit) = 240 ml, 1 cup (Mehl) = 130 g, 1
     cup (Zucker) = 200 g, 1 cup (Butter) = 227 g, 1 oz = 28 g, 1 lb = 454
     g, 1 fl oz = 30 ml, 1 quart = 946 ml, 1 pint = 473 ml, 1 gallon =
     3785 ml, 1 stick Butter = 113 g. Bei cups das zur Zutat passende
     Gewicht wählen (z. B. "1 cup flour" → "130 g Mehl", "1 cup milk" →
     "240 ml Milch"). Ergebnisse auf sinnvolle Werte runden (454 g → 450
     g, 227 g → 225 g).

2. **Zubereitungsschritte als Array**: jeder Schritt ein eigener String,
   niemals mehrere Schritte in einem String zusammenfassen. Nummerierte
   Präfixe ("1.", "2. Schritt", …) entfernen — die Array-Position
   übernimmt die Nummerierung. Ein vorangestelltes Kurz-Label wie "Ofen
   vorheizen:" dagegen im Schritt-Text belassen, wenn es im Original
   steht — es ist Teil des Inhalts, keine reine Nummerierung. Übernimm
   **nur** Schritte, die tatsächlich im Ausgangstext stehen — ergänze
   keine zusätzlichen Arbeitsschritte, Zeiten oder Temperaturen aus
   allgemeinem Kochwissen, auch wenn sie plausibel wirken. Enthält der
   Text nur eine Zutatenliste ohne Zubereitungsanleitung, erfinde keine
   Schritte (siehe Pflichtfeld-Hinweis unten — dann lieber nachfragen,
   statt zu raten).

3. **`kulinarik` und `speisekategorie` an die App-Listen anlehnen**: Die
   App validiert diese Felder nicht hart gegen eine feste Liste, aber für
   Konsistenz mit dem Rest des RecipeBooks aus diesen Standardwerten wählen
   (der Nutzer kann seine Listen in den Einstellungen angepasst haben —
   bei Unsicherheit lieber den nächstliegenden Wert nehmen als raten):
   - **Kulinarik** (Array, `DEFAULT_CUISINE_TYPES`): Deutsche, Französische,
     Italienische, Österreichische, Schweizer, Türkische, Chinesische,
     Indische, Japanische, Orientalische, Thailändische, Mexikanische,
     US-Amerikanische, Weihnachtliche Küche, sowie **Vegetarisch** und
     **Vegan**. Enthält das Rezept kein Fleisch/Fisch, füge zusätzlich
     immer `"Vegetarisch"` hinzu; enthält es keinerlei tierische Produkte
     (auch keine Butter/Eier/Milchprodukte), füge zusätzlich immer
     `"Vegetarisch"` **und** `"Vegan"` hinzu — das kommt zur eigentlichen
     Herkunfts-Küche dazu, ersetzt sie nicht.
   - **Speisekategorie** (`DEFAULT_MEAL_CATEGORIES`): Appetizer, Dips &
     Saucen, Vorspeisen, Salate, Suppen & Eintöpfe, Hauptspeisen,
     Desserts, Drinks, Beilagen & Grundrezepte, Gebäcke & Teige, Kuchen &
     Torten, Grillrezepte. **Wichtig:** anders als im internen KI-Prompt
     ist `speisekategorie` bei `addRecipeViaAPI` ein einzelner String,
     keine Mehrfachauswahl — wähle die am besten passende Kategorie.

4. **Tags**: nur hinzufügen, was im Text explizit erwähnt wird oder
   eindeutig aus den Zutaten ableitbar ist (z. B. "glutenfrei", wenn
   explizit so bezeichnet) — nicht mit den `kulinarik`-Werten
   Vegetarisch/Vegan doppeln, die gehören dort hinein, nicht in `tags`.

5. **Fehlende optionale Felder schätzen, aber kennzeichnen**: Wenn
   `kochdauer` oder `schwierigkeit` im Text nicht explizit stehen,
   schätze sie sinnvoll aus dem Kontext (Zutaten, Zubereitungsart,
   Gerichtstyp) statt sie wegzulassen — ein grob geschätztes Feld ist für
   den Nutzer nützlicher als ein fehlendes, das er dann manuell in der
   App nachträgt. Liste aber am Ende **kurz auf, welche Felder geschätzt
   wurden** (nicht wörtlich aus dem Text übernommen oder nach der
   Listen-Regel oben bestimmt), damit der Nutzer sie bei Bedarf
   korrigieren kann, bevor er das JSON verwendet.

6. **`schwierigkeit`** liegt zwischen 1 und 5 (die Cloud Function lehnt
   alles außerhalb ab). Schätze nach Anzahl/Komplexität der Schritte und
   Techniken, nicht nach Zutatenanzahl allein.

7. **`kochdauer`** ist die Gesamtzeit in Minuten als reine Zahl (kein
   "ca." oder "Min." im Wert). Nennt der Text Zubereitungszeit und
   Kochzeit getrennt (wie im internen Prompt als `zubereitungszeit` +
   `kochzeit`), addiere sie zu einer Gesamtzahl — `addRecipeViaAPI` hat
   nur ein einziges Zeitfeld, keine getrennten Vor-/Kochzeiten.

## Output-Format

Gib immer zwei Teile aus:

**1. Das JSON** in einem Codeblock, direkt einsetzbar als Body für
`addRecipeViaAPI`.

**2. Ein curl-Template** mit Platzhaltern, damit der Nutzer es nur noch
mit seinen eigenen Werten füllen muss:

```bash
curl -X POST "https://us-central1-<PROJECT-ID>.cloudfunctions.net/addRecipeViaAPI" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: <API-KEY>" \
  -H "X-User-Email: <EMAIL>" \
  -d '<JSON hier einsetzen>'
```

Danach kurz (2–3 Zeilen, kein eigener Abschnitt nötig) die geschätzten
Felder benennen, z. B.: "Geschätzt habe ich `schwierigkeit` (2) und
`speisekategorie` (Hauptgericht) — im Text nicht explizit genannt."

Wenn ein **Pflichtfeld** (Titel, Zutaten oder Zubereitungsschritte) im
Ausgangstext fehlt oder leer ist, erzeuge kein unvollständiges JSON,
sondern frag kurz nach, was dort rein soll — die Cloud Function würde den
Request sonst ohnehin mit HTTP 400 ablehnen.

## Beispiel

**Input** (Fließtext/Diktat):
```
Süßkartoffelspalten mit Chipotle-Mayo
Beschreibung: Knusprige Ofen-Wedges mit rauchig-scharfer Mayo
Portionen: 4
Zutaten:
- 800 g Süßkartoffeln
- 3 EL Olivenöl
...
Zubereitung:
1. Ofen vorheizen: Backofen auf 220°C vorheizen.
2. Süßkartoffeln in Spalten schneiden.
...
```

**Output** (Auszug):
```json
{
  "title": "Süßkartoffelspalten mit Chipotle-Mayo",
  "portionen": 4,
  "kulinarik": ["US-Amerikanische Küche", "Vegetarisch"],
  "speisekategorie": "Beilagen & Grundrezepte",
  "ingredients": ["800 g Süßkartoffeln", "3 Esslöffel Olivenöl"],
  "steps": [
    "Ofen vorheizen: Backofen auf 220°C vorheizen.",
    "Süßkartoffeln in Spalten schneiden."
  ],
  "notizen": "Knusprige Ofen-Wedges mit rauchig-scharfer Mayo"
}
```
(Beachte: Der numerierte Präfix "1."/"2." ist weg, "Ofen vorheizen:" als
Label im ersten Schritt ist geblieben, die Beschreibung ist in `notizen`
gewandert, "3 EL" wurde zu "3 Esslöffel" ausgeschrieben, und da das
Rezept ohne Fleisch/Fisch auskommt, wurde "Vegetarisch" zur `kulinarik`
hinzugefügt statt es zu ersetzen.)
