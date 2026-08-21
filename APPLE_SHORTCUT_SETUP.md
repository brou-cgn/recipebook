# Apple Shortcut Setup – RecipeBook API

Diese Anleitung erklärt, wie du Rezepte direkt aus einem Apple Kurzbefehl (Shortcut) in dein RecipeBook importieren kannst.

## Fertigen Kurzbefehl herunterladen

Statt den Kurzbefehl manuell nachzubauen (siehe unten), kannst du auch den fertigen Kurzbefehl laden:

**[Kurzbefehl herunterladen](https://www.icloud.com/shortcuts/47ecb3c5292d473eb92ee5ae2f2a92e4)**

Der Link ist außerdem im Hamburger-Menü der App unter **Hilfe → Kurzbefehl installieren** hinterlegt und dort für alle Nutzer sichtbar (nicht nur Admins) – der Menüpunkt erscheint aber nur auf iPhone, iPad und Mac, da nur dort eine Kurzbefehle-App existiert.

**Hinweis:** Dieser fertige Kurzbefehl startet den Import per **Deeplink** (`https://broubook.web.app/?webimport=<url>`, Aktion „URL öffnen"). Das öffnet dabei jedes Mal die komplette Web-App in Safari (JS-Bundle laden, Firebase-Auth initialisieren) und wartet erst danach auf den eigentlichen Import – das kann sich auf dem iPhone lange und wackelig anfühlen. Für einen deutlich schnelleren und stabileren Import per URL nutze stattdessen den Abschnitt **„Rezept von einer URL importieren"** unten – dafür musst du den heruntergeladenen Kurzbefehl entsprechend abändern (die „URL öffnen"-Aktion durch „Inhalt von URL laden" ersetzen) oder ihn manuell nachbauen.

## Authentifizierung

Alle Shortcut-Endpoints (`importRecipeShortcut`, `addRecipeViaAPI`, `createRecipeImportFromText`) verwenden **API Key Authentifizierung** statt Firebase Auth Tokens. Ein API Key ist dauerhaft gültig und muss nur einmal im Kurzbefehl hinterlegt werden – derselbe Key funktioniert für alle drei Endpoints.

- **`X-Api-Key`** Header: dein persönlicher API Key (als Firebase Secret gespeichert)
- **`X-User-Email`** Header: deine registrierte E-Mail-Adresse (wird serverseitig per `admin.auth().getUserByEmail` zur Firebase User ID aufgelöst – du musst deine UID nicht mehr nachschlagen)

---

## Rezept von einer URL importieren (empfohlen)

Für den Fall „ich habe eine Rezept-URL und will sie importieren" (der Anwendungsfall des bisherigen Deeplink-Kurzbefehls) rufst du direkt die `importRecipeShortcut` Cloud Function auf. Sie legt die URL sofort als Import-Job in Firestore ab und antwortet in unter einer Sekunde – der eigentliche Import (Website laden, JSON-LD/Text/Screenshot + Gemini AI) läuft danach serverseitig im Hintergrund, unabhängig davon, ob der Kurzbefehl/das Handy währenddessen online bleibt. Das fertige Rezept erscheint automatisch in der Review-Queue „Neue Rezepte" der App, sobald du sie das nächste Mal öffnest.

### Aktion: „Inhalt von URL laden"

| Feld | Wert |
|------|------|
| URL | `https://us-central1-<PROJECT-ID>.cloudfunctions.net/importRecipeShortcut` |
| Methode | `POST` |

**Headers:**

| Name | Wert |
|------|------|
| `Content-Type` | `application/json` |
| `X-Api-Key` | `<dein-api-key>` |
| `X-User-Email` | `<deine-e-mail-adresse>` |

**Body:**

```json
{ "url": "<Rezept-URL, z. B. aus „Text abrufen aus Eingabe“>" }
```

**Antwort (HTTP 200) – Job wurde eingereiht, noch nicht fertig importiert:**

```json
{ "success": true, "jobId": "abc123xyz", "status": "queued" }
```

Der Kurzbefehl braucht auf diese Antwort hin nichts weiter zu tun – kein Warten, kein Öffnen der App nötig. Ein `success: true` bedeutet nur „URL wurde entgegengenommen", nicht „Rezept wurde korrekt erkannt"; falls die Erkennung fehlschlägt, taucht der Job mit Fehlermeldung (statt als fertiges Rezept) in der Review-Queue auf und kann dort neu gestartet werden.

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

## Schritt 3: E-Mail-Adresse verwenden

Nutze einfach die E-Mail-Adresse, mit der du in RecipeBook registriert bist – eine UID musst du dafür nicht mehr nachschlagen.

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
| `X-User-Email` | `<deine-e-mail-adresse>` |

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
| 401 | Fehlender oder ungültiger API Key / User Email Header |
| 403 | E-Mail-Adresse unbekannt oder fehlende Berechtigung (Rolle muss `edit` oder `admin` sein) – aus Enumeration-Schutz gibt es hierfür bewusst nur eine generische Fehlermeldung |
| 405 | Falsche HTTP-Methode (nur POST erlaubt) |
| 500 | Fehler beim Speichern in Firestore oder fehlendes SHORTCUT_API_KEY Secret |

---

## Tipp: KI-gestützter Import mit OpenAI

Du kannst im Kurzbefehl **OpenAI** (oder eine andere KI) nutzen, um Rezepttexte automatisch zu strukturieren:

1. Nimm ein Foto oder füge Text ein
2. Schicke ihn an die OpenAI API mit einem Prompt wie:
   > „Extrahiere dieses Rezept als JSON mit den Feldern: title, ingredients (Array), steps (Array), portionen, kochdauer, schwierigkeit (1-5), speisekategorie, kulinarik."
3. Das strukturierte JSON schickst du dann an `addRecipeViaAPI`

So ersetzt du den bisherigen „Notiz erstellen"-Schritt durch einen direkten Import ins RecipeBook.

---

## Rezept exportieren mit Service-User

Für den Kurzbefehl „Rezept exportieren" wird ein technischer **Service-User** zur Authentifizierung verwendet.

### Voraussetzungen

1. Erstelle einen dedizierten Service-User in Firebase Authentication (z. B. `shortcut-service@example.com`)
2. Setze in der Firestore `users`-Collection auf diesem User-Dokument: `isShortcutUser: true`
3. Notiere die E-Mail-Adresse des Service-Users

### Kurzbefehl-Aktion: `createRecipeImportFromText`

Füge eine **„Inhalt von URL laden"** Aktion hinzu:

| Feld | Wert |
|------|------|
| URL | `https://us-central1-<PROJECT-ID>.cloudfunctions.net/createRecipeImportFromText` |
| Methode | `POST` |

**Headers:**

| Name | Wert |
|------|------|
| `Content-Type` | `application/json` |
| `X-Api-Key` | `<dein-api-key>` |
| `X-User-Email` | `<e-mail-adresse-des-service-users>` |

**Body:** `{ "rawText": "<Rezepttext>" }`

### Antwort verarbeiten

Die Cloud Function gibt zurück:

```json
{
  "success": true,
  "importUrl": "https://.../recipeImportPage?token=..."
}
```

### App-URL aufbauen

Nach dem API-Call öffnest du die `importUrl` mit der Aktion „URL öffnen".

**Hinweis:** `recipeImportPage` ist aktuell eine eigenständige, statische Antwortseite der Cloud Function (Titel + Rezepttext + JSON-LD) ohne Verbindung zur React-App-Shell — es gibt keinen automatischen Redirect in den Import-Workflow der App. Zusätzlich öffnet iOS eine per Shortcuts-Aktion „URL öffnen" aufgerufene Adresse grundsätzlich in Safari, auch wenn die PWA installiert ist und dieselbe Domain/denselben Scope hat; das ist eine iOS-Plattformeinschränkung und lässt sich nicht per Manifest/Scope-Konfiguration umgehen. Für einen tatsächlichen In-App-Import muss der Nutzer nach dem Öffnen manuell zur installierten App wechseln.

---

## Troubleshooting

**„Invalid API key" (401)**
- Prüfe, ob der API Key im Header exakt mit dem gespeicherten Secret übereinstimmt
- Stelle sicher, dass die Function neu deployt wurde: `firebase deploy --only functions:addRecipeViaAPI`

**„Access denied" / „Insufficient permissions" (403)**
- Prüfe, ob die E-Mail-Adresse korrekt (und exakt wie registriert) eingetragen wurde
- Stelle sicher, dass der Benutzer in der Firebase Authentication existiert und einen Eintrag in der `users` Firestore-Collection hat
- Stelle sicher, dass der Benutzer die Rolle `edit` oder `admin` hat, oder `isShortcutUser: true` gesetzt ist

**„Method not allowed" (405)**
- Stelle sicher, dass die HTTP-Methode auf `POST` gesetzt ist

**Body wird nicht erkannt (400)**
- Stelle sicher, dass der `Content-Type: application/json` Header gesetzt ist
- Validiere dein JSON (z. B. mit [jsonlint.com](https://jsonlint.com))
