# Apple Shortcut Setup – RecipeBook API

Diese Anleitung erklärt, wie du Rezepte direkt aus einem Apple Kurzbefehl (Shortcut) in dein RecipeBook importieren kannst.

## Authentifizierung

Die `addRecipeViaAPI` Cloud Function verwendet **API Key Authentifizierung** statt Firebase Auth Tokens. Ein API Key ist dauerhaft gültig und muss nur einmal im Kurzbefehl hinterlegt werden.

- **`X-Api-Key`** Header: dein persönlicher API Key (als Firebase Secret gespeichert)
- **`X-User-Id`** Header: deine Firebase User ID

---

## Schritt 1: API Key generieren

Generiere einen sicheren, zufälligen API Key:

```bash
openssl rand -hex 32
```

Beispielausgabe:
```
a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2
```

Diesen Wert notierst du dir – er wird sowohl in Firebase als Secret als auch im Apple Kurzbefehl eingetragen.

---

## Schritt 2: API Key als Firebase Secret speichern

```bash
firebase functions:secrets:set SHORTCUT_API_KEY
```

Wenn du dazu aufgefordert wirst, gibst du den zuvor generierten API Key ein. Das Secret wird sicher in Google Cloud Secret Manager gespeichert und ist nur der Cloud Function zugänglich.

Anschließend die Function deployen:

```bash
firebase deploy --only functions:addRecipeViaAPI
```

---

## Schritt 3: User ID herausfinden

1. Öffne die [Firebase Console](https://console.firebase.google.com/)
2. Wähle dein Projekt aus
3. Navigiere zu **Authentication** → **Benutzer**
4. Suche deinen Benutzer und klicke darauf
5. Kopiere die **UID** (z. B. `abc123XYZdef456`)

---

## Schritt 4: Apple Kurzbefehl konfigurieren

### Aktion: „Inhalt von URL laden"

Füge im Kurzbefehl eine **„Inhalt von URL laden"** Aktion hinzu und konfiguriere sie wie folgt:

| Feld | Wert |
|------|------|
| URL | `https://us-central1-<PROJECT-ID>.cloudfunctions.net/addRecipeViaAPI` |
| Methode | `POST` |

**Headers:**

| Name | Wert |
|------|------|
| `Content-Type` | `application/json` |
| `X-Api-Key` | `<dein-api-key>` |
| `X-User-Id` | `<deine-firebase-uid>` |

**Body:** JSON (siehe Beispiel unten)

---

## Beispiel-JSON für den Request Body

```json
{
  "title": "Spaghetti Carbonara",
  "portionen": 4,
  "kochdauer": 30,
  "schwierigkeit": 2,
  "kulinarik": ["Italienisch"],
  "speisekategorie": "Hauptgericht",
  "tags": ["klassisch", "pasta"],
  "ingredients": [
    "400 g Spaghetti",
    "200 g Guanciale",
    "4 Eigelb",
    "100 g Pecorino Romano",
    "Schwarzer Pfeffer",
    "Salz"
  ],
  "steps": [
    "Wasser in einem großen Topf zum Kochen bringen und salzen.",
    "Guanciale in Würfel schneiden und bei mittlerer Hitze knusprig braten.",
    "Eigelb mit geriebenem Pecorino und Pfeffer verrühren.",
    "Spaghetti bissfest kochen, etwas Kochwasser auffangen.",
    "Pasta zum Guanciale geben, von der Hitze nehmen.",
    "Ei-Käse-Mischung unterrühren, mit Nudelwasser cremig rühren und sofort servieren."
  ],
  "notizen": "Pfanne unbedingt von der Hitze nehmen, bevor die Eier hinzugefügt werden."
}
```

### Unterstützte Felder

| Internes Feld | Akzeptiert als | Typ | Pflichtfeld |
|---|---|---|---|
| `title` | `titel` | string | ✅ |
| `ingredients` | `zutaten` | string[] | ✅ |
| `steps` | `zubereitung` | string[] | ✅ |
| `portionen` | `servings`, `portions` | number | – |
| `kochdauer` | `cookTime`, `prepTime`, `zubereitungszeit` | number | – |
| `schwierigkeit` | `difficulty` | number (1–5) | – |
| `speisekategorie` | `category`, `kategorie` | string | – |
| `kulinarik` | `cuisine`, `kulinarisch` | string \| string[] | – |
| `tags` | – | string \| string[] | – |
| `notizen` | `notes` | string | – |

---

## Erfolgreiche Antwort (HTTP 200)

```json
{
  "success": true,
  "recipeId": "abc123xyz"
}
```

---

## Fehlercodes

| HTTP Status | Bedeutung |
|-------------|-----------|
| 400 | Fehlende oder ungültige Felder im Body |
| 401 | Fehlender oder ungültiger API Key / User ID Header |
| 404 | User nicht gefunden |
| 405 | Falsche HTTP-Methode (nur POST erlaubt) |
| 500 | Fehler beim Speichern in Firestore |

---

## Tipp: KI-gestützter Import mit OpenAI

Du kannst im Kurzbefehl **OpenAI** (oder eine andere KI) nutzen, um Rezepttexte automatisch zu strukturieren:

1. Nimm ein Foto oder füge Text ein
2. Schicke ihn an die OpenAI API mit einem Prompt wie:
   > „Extrahiere dieses Rezept als JSON mit den Feldern: title, ingredients (Array), steps (Array), portionen, kochdauer, schwierigkeit (1-5), speisekategorie, kulinarik."
3. Das strukturierte JSON schickst du dann an `addRecipeViaAPI`

So ersetzt du den bisherigen „Notiz erstellen"-Schritt durch einen direkten Import ins RecipeBook.

---

## Troubleshooting

**„Invalid API key" (401)**
- Prüfe, ob der API Key im Header exakt mit dem gespeicherten Secret übereinstimmt
- Stelle sicher, dass die Function neu deployt wurde: `firebase deploy --only functions:addRecipeViaAPI`

**„User not found" (404)**
- Prüfe, ob die User ID korrekt kopiert wurde
- Stelle sicher, dass der Benutzer in der Firebase Authentication existiert und einen Eintrag in der `users` Firestore-Collection hat

**„Method not allowed" (405)**
- Stelle sicher, dass die HTTP-Methode auf `POST` gesetzt ist

**Body wird nicht erkannt (400)**
- Stelle sicher, dass der `Content-Type: application/json` Header gesetzt ist
- Validiere dein JSON (z. B. mit [jsonlint.com](https://jsonlint.com))
