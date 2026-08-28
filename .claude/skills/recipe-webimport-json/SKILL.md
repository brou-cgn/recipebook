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

## Umwandlungsregeln

1. **Zutaten als Array**: eine Zutat pro Element, Mengen/Einheiten exakt
   wie im Original übernehmen (keine Umrechnung, z. B. "1/2 TL" bleibt
   "1/2 TL", nicht "0,5 TL").

2. **Zubereitungsschritte als Array**: nummerierte Präfixe ("1.", "2.
   Schritt", …) entfernen — die Array-Position übernimmt die
   Nummerierung. Ein vorangestelltes Kurz-Label wie "Ofen vorheizen:"
   dagegen im Schritt-Text belassen, wenn es im Original steht — es ist
   Teil des Inhalts, keine reine Nummerierung.

3. **Fehlende optionale Felder schätzen, aber kennzeichnen**: Wenn
   `kochdauer`, `schwierigkeit`, `speisekategorie`, `kulinarik` oder
   `tags` im Text nicht explizit stehen, schätze sie sinnvoll aus dem
   Kontext (Zutaten, Zubereitungsart, Gerichtstyp) statt sie wegzulassen —
   ein grob geschätztes Feld ist für den Nutzer nützlicher als ein
   fehlendes, das er dann manuell in der App nachträgt. Liste aber am
   Ende **kurz auf, welche Felder geschätzt wurden** (nicht wörtlich aus
   dem Text übernommen), damit der Nutzer sie bei Bedarf korrigieren
   kann, bevor er das JSON verwendet.

4. **`schwierigkeit`** liegt zwischen 1 und 5 (die Cloud Function lehnt
   alles außerhalb ab). Schätze nach Anzahl/Komplexität der Schritte und
   Techniken, nicht nach Zutatenanzahl allein.

5. **`kochdauer`** ist die Gesamtzeit in Minuten als reine Zahl (kein
   "ca." oder "Min." im Wert). Bei getrennt genannten Vor-/Kochzeiten
   addiere sie, sofern der Text nicht explizit nur eine Backzeit meint.

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
  "ingredients": ["800 g Süßkartoffeln", "3 EL Olivenöl"],
  "steps": [
    "Ofen vorheizen: Backofen auf 220°C vorheizen.",
    "Süßkartoffeln in Spalten schneiden."
  ],
  "notizen": "Knusprige Ofen-Wedges mit rauchig-scharfer Mayo"
}
```
(Beachte: Der numerierte Präfix "1."/"2." ist weg, "Ofen vorheizen:" als
Label im ersten Schritt ist geblieben, die Beschreibung ist in `notizen`
gewandert.)
