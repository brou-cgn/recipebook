# 📖 RecipeBook Zugriff - Schritt-für-Schritt-Anleitung

**Für Benutzer und Nicht-Techniker**

Diese Anleitung erklärt verständlich, wie Sie auf das RecipeBook-System zugreifen können und was zu tun ist, wenn der Zugriff nicht funktioniert.

---

## 🎯 Schnellstart: Zugang zur App

### Option 1: Als registrierter Benutzer 👤

1. **App öffnen:**
   - Gehen Sie zu: **https://brou-cgn.github.io/recipebook**
   - Warten Sie, bis die Seite vollständig geladen ist

2. **Anmelden:**
   - Geben Sie Ihre **E-Mail-Adresse** ein
   - Geben Sie Ihr **Passwort** ein
   - Klicken Sie auf **"Anmelden"**

3. **Fertig!** Sie sehen nun Ihre Rezepte

### Option 2: Als Gast 🚶
   
1. **App öffnen:**
   - Gehen Sie zu: **https://brou-cgn.github.io/recipebook**

2. **Als Gast anmelden:**
   - Klicken Sie auf **"Als Gast anmelden"**
   
3. **Fertig!** Sie können Rezepte ansehen (aber nicht erstellen/bearbeiten)

### Option 3: Neu registrieren 📝

1. **App öffnen:**
   - Gehen Sie zu: **https://brou-cgn.github.io/recipebook**

2. **Registrierung starten:**
   - Klicken Sie auf **"Jetzt registrieren"**

3. **Formular ausfüllen:**
   - **Vorname:** z.B. "Max"
   - **Nachname:** z.B. "Mustermann"
   - **E-Mail:** z.B. "max@beispiel.de"
   - **Passwort:** Mindestens 6 Zeichen
   - **Passwort wiederholen:** Nochmal das gleiche Passwort

4. **Absenden:**
   - Klicken Sie auf **"Registrieren"**
   
5. **Automatische Anmeldung:**
   - Sie werden automatisch angemeldet und sehen die Rezeptliste

**💡 Tipp:** Der **erste Benutzer**, der sich registriert, wird automatisch **Administrator** und kann später weitere Benutzer verwalten!

---

## ❓ Probleme beim Zugriff?

Wenn Sie die App nicht erreichen oder sich nicht anmelden können, folgen Sie dieser Checkliste:

### Problem 1: "Seite kann nicht angezeigt werden" oder leere Seite

**Was Sie sehen:**
- Weiße/leere Seite
- Oder: Fehlermeldung "Diese Seite ist nicht erreichbar"

**Lösungsschritte:**

1. ✅ **Internetverbindung prüfen**
   - Öffnen Sie eine andere Website (z.B. google.de)
   - Funktioniert diese? → Internet ist OK
   - Funktioniert nicht? → Problem mit Ihrer Internetverbindung

2. ✅ **Richtige URL verwenden**
   - URL muss exakt sein: `https://brou-cgn.github.io/recipebook`
   - **Mit** `https://` am Anfang
   - **Ohne** Leerzeichen
   - **Klein** geschrieben: `recipebook` (nicht `RecipeBook`)

3. ✅ **Browser aktualisieren**
   - Drücken Sie `Strg + F5` (Windows) oder `Cmd + Shift + R` (Mac)
   - Dies lädt die Seite komplett neu

4. ✅ **Anderen Browser testen**
   - Versuchen Sie:
     - Google Chrome
     - Mozilla Firefox  
     - Microsoft Edge
     - Safari (auf Mac/iOS)

5. ✅ **24 Stunden warten**
   - Bei ersten Deployment kann es bis zu 24 Stunden dauern
   - GitHub Pages muss die Seite erst aktivieren

**Immer noch leere Seite?**
→ Siehe Abschnitt "Für Administratoren" weiter unten

---

### Problem 2: "Anmeldung fehlgeschlagen"

**Was Sie sehen:**
- Fehlermeldung beim Login: "Anmeldung fehlgeschlagen"
- Oder: "Falsches Passwort"
- Oder: "Benutzer nicht gefunden"

**Lösungsschritte:**

1. ✅ **E-Mail-Adresse überprüfen**
   - Korrekt geschrieben?
   - Keine Leerzeichen am Anfang oder Ende?
   - Richtige Domain? (z.B. @gmail.com, nicht @gmial.com)

2. ✅ **Passwort überprüfen**
   - Groß-/Kleinschreibung beachten!
   - Kein Leerzeichen am Ende?
   - **Caps Lock** versehentlich aktiviert?

3. ✅ **Sind Sie registriert?**
   - Haben Sie sich schon einmal registriert?
   - **Nein** → Klicken Sie auf "Jetzt registrieren"
   - **Ja** → Vielleicht andere E-Mail-Adresse verwendet?

4. ✅ **Passwort vergessen?**
   - Kontaktieren Sie einen Administrator
   - Administrator kann temporäres Passwort setzen
   - Sie werden beim nächsten Login aufgefordert, es zu ändern

5. ✅ **Browser-Cache löschen**
   - Chrome: `Strg + Shift + Entf` → "Cookies" auswählen → Löschen
   - Firefox: `Strg + Shift + Entf` → "Cookies" auswählen → Löschen
   - Safari: Einstellungen → Datenschutz → Cookies löschen

**Immer noch Probleme?**
→ Siehe Abschnitt "Für Administratoren: Benutzerverwaltung"

---

### Problem 3: "Ich kann keine Rezepte erstellen"

**Was Sie sehen:**
- Button "+ Rezept hinzufügen" ist nicht sichtbar
- Oder: Button ist ausgegraut/deaktiviert

**Lösungsschritte:**

1. ✅ **Sind Sie angemeldet?**
   - Oben rechts sollte Ihr Name stehen
   - Nein? → Melden Sie sich an
   - Ja? → Weiter zu Schritt 2

2. ✅ **Haben Sie die richtige Berechtigung?**
   
   **Berechtigungen erklärt:**
   
   | Berechtigung | Symbol | Kann Rezepte erstellen? | Kann bearbeiten? |
   |--------------|--------|-------------------------|------------------|
   | **Gast** | 🚶 | ❌ Nein | ❌ Nein |
   | **Lesen** | 👁️ | ❌ Nein | ❌ Nein |
   | **Kommentieren** | 💬 | ❌ Nein | ❌ Nein |
   | **Bearbeiten** | ✏️ | ✅ Ja | ✅ Eigene Rezepte |
   | **Administrator** | 👑 | ✅ Ja | ✅ Alle Rezepte |

   **Wo sehe ich meine Berechtigung?**
   - Oben rechts auf Ihren Namen klicken → Einstellungen
   - Oder: Fragen Sie einen Administrator

3. ✅ **Als Gast angemeldet?**
   - Gäste können **keine** Rezepte erstellen
   - Lösung: Registrieren Sie sich für ein echtes Konto

4. ✅ **Berechtigung ändern lassen**
   - Nur Administratoren können Berechtigungen ändern
   - Bitten Sie einen Administrator:
     1. Einstellungen → Benutzerverwaltung
     2. Ihr Name → 🔐-Symbol klicken
     3. "Bearbeiten" oder "Administrator" auswählen

**💡 Tipp:** Neue Benutzer erhalten standardmäßig nur **"Lesen"**-Rechte. Dies ist eine Sicherheitsmaßnahme.

---

### Problem 4: "Registrierung funktioniert nicht"

**Was Sie sehen:**
- Fehler beim Absenden des Registrierungsformulars
- Oder: "Ein Fehler ist aufgetreten"

**Lösungsschritte:**

1. ✅ **Formular korrekt ausgefüllt?**
   - **Alle Felder** müssen ausgefüllt sein:
     - Vorname ✓
     - Nachname ✓
     - E-Mail ✓
     - Passwort ✓
     - Passwort wiederholen ✓
   
2. ✅ **Passwort-Anforderungen erfüllt?**
   - Mindestens **6 Zeichen** lang
   - Beide Passwort-Felder müssen **identisch** sein

3. ✅ **E-Mail bereits registriert?**
   - Versuchen Sie sich anzumelden statt zu registrieren
   - Oder: Nutzen Sie eine andere E-Mail-Adresse

4. ✅ **Internetverbindung vorhanden?**
   - Registrierung benötigt Internetverbindung
   - Prüfen Sie, ob Sie online sind

**Immer noch Fehler?**
→ Kontaktieren Sie einen Administrator oder siehe "Für Administratoren" weiter unten

---

### Problem 5: "Rezepte werden nicht angezeigt"

**Was Sie sehen:**
- Leere Rezeptliste
- Oder: "Keine Rezepte vorhanden"
- Aber Sie wissen, dass Rezepte existieren sollten

**Lösungsschritte:**

1. ✅ **Sind Sie angemeldet?**
   - Nur angemeldete Benutzer sehen Rezepte
   - Oben rechts sollte Ihr Name stehen
   - Nicht angemeldet? → Jetzt anmelden

2. ✅ **Gibt es überhaupt Rezepte?**
   - Beim ersten Start ist die Datenbank leer
   - Erstellen Sie ein Test-Rezept (wenn Sie Berechtigung haben)
   - Oder: Warten Sie, bis jemand Rezepte erstellt

3. ✅ **Filter aktiv?**
   - Überprüfen Sie, ob ein Kategoriefilter gesetzt ist
   - Filter zurücksetzen: "Alle Kategorien" auswählen

4. ✅ **Offline-Modus?**
   - Beim **ersten Besuch** benötigen Sie Internet
   - Die App lädt Rezepte vom Server
   - Danach funktioniert sie auch offline

5. ✅ **Seite neu laden**
   - Drücken Sie `F5` oder klicken Sie auf das Reload-Symbol
   - Warten Sie einige Sekunden

**💡 Tipp:** Die App funktioniert offline, aber beim ersten Mal muss sie online sein, um Daten herunterzuladen!

---

## 👑 Für Administratoren

### Benutzerverwaltung

Als Administrator können Sie:
- ✅ Berechtigungen zuweisen
- ✅ Passwörter zurücksetzen
- ✅ Benutzer löschen

**So geht's:**

1. **Benutzerverwaltung öffnen:**
   - Oben rechts auf Ihren Namen klicken
   - **Einstellungen** auswählen
   - **Benutzerverwaltung** anklicken

2. **Alle Benutzer sehen:**
   - Liste aller registrierten Benutzer
   - Mit aktueller Berechtigung

3. **Berechtigung ändern:**
   - 🔐-Symbol neben Benutzername klicken
   - Neue Berechtigung auswählen:
     - **Administrator** - Volle Kontrolle
     - **Bearbeiten** - Rezepte erstellen/bearbeiten
     - **Kommentieren** - Kommentare (zukünftig)
     - **Lesen** - Nur ansehen
   - Bestätigen

4. **Passwort zurücksetzen:**
   - 🔑-Symbol neben Benutzername klicken
   - Temporäres Passwort eingeben
   - Benutzer erhält Aufforderung zum Ändern beim nächsten Login

5. **Benutzer löschen:**
   - 🗑️-Symbol neben Benutzername klicken
   - Bestätigen
   - **Achtung:** Kann nicht rückgängig gemacht werden!

**⚠️ Wichtig:**
- Sie können **sich selbst nicht löschen**
- Sie können **nicht den letzten Administrator entfernen**
- System muss immer mindestens 1 Administrator haben

---

### Technische Probleme beheben (für Admins/Techniker)

#### 🔧 Leere Seite beheben (GitHub/Firebase)

**Problem:** Die deployed App zeigt nur eine leere Seite

**Ursache:** Firebase-Zugangsdaten fehlen in GitHub

**Lösung (Schritt-für-Schritt):**

1. **Firebase-Daten abrufen:**
   
   a) Gehen Sie zu: [Firebase Console](https://console.firebase.google.com/)
   
   b) Wählen Sie Ihr Projekt aus (z.B. "recipebook")
   
   c) Klicken Sie auf das **Zahnrad-Symbol ⚙️** → **Projekteinstellungen**
   
   d) Scrollen Sie zu **"Deine Apps"**
   
   e) Klicken Sie auf **"Config"** unter "Firebase SDK snippet"
   
   f) **Kopieren Sie** diese 7 Werte:
   ```
   apiKey: "AIza..."
   authDomain: "projekt.firebaseapp.com"
   projectId: "projekt"
   storageBucket: "projekt.firebasestorage.app"
   messagingSenderId: "123456"
   appId: "1:123456:web:abc123"
   measurementId: "G-XXXXX"
   ```

2. **GitHub Secrets einrichten:**
   
   a) Gehen Sie zu: **https://github.com/brou-cgn/recipebook**
   
   b) Klicken Sie auf **Settings** (Einstellungen)
   
   c) Links im Menü: **Secrets and variables** → **Actions**
   
   d) Klicken Sie auf **"New repository secret"**
   
   e) **Fügen Sie jedes Secret einzeln hinzu:**
   
   | Secret Name (exakt!) | Wert von Firebase |
   |---------------------|-------------------|
   | `REACT_APP_FIREBASE_API_KEY` | Der `apiKey` Wert |
   | `REACT_APP_FIREBASE_AUTH_DOMAIN` | Der `authDomain` Wert |
   | `REACT_APP_FIREBASE_PROJECT_ID` | Der `projectId` Wert |
   | `REACT_APP_FIREBASE_STORAGE_BUCKET` | Der `storageBucket` Wert |
   | `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` | Der `messagingSenderId` Wert |
   | `REACT_APP_FIREBASE_APP_ID` | Der `appId` Wert |
   | `REACT_APP_FIREBASE_MEASUREMENT_ID` | Der `measurementId` Wert |
   
   **Für jedes Secret:**
   - **Name:** Exakt wie in Tabelle (mit `REACT_APP_` Präfix!)
   - **Value:** Der entsprechende Wert aus Firebase
   - **Add secret** klicken

3. **Deployment neu starten:**
   
   a) Gehen Sie zu **Actions** in Ihrem Repository
   
   b) Wählen Sie **"Deploy to GitHub Pages"**
   
   c) Klicken Sie auf **"Run workflow"** → **"Run workflow"**
   
   d) Warten Sie 1-2 Minuten
   
   e) ✅ Grüner Haken = Erfolgreich
   
   f) Öffnen Sie: https://brou-cgn.github.io/recipebook

4. **Überprüfung:**
   - Seite sollte nun laden
   - Login-Bildschirm sollte erscheinen
   - Keine leere Seite mehr!

**📋 Detaillierte Anleitung:** Siehe [GITHUB_SECRETS_SETUP.md](GITHUB_SECRETS_SETUP.md)

---

#### 🔧 Firebase Authentication aktivieren

**Problem:** Login funktioniert nicht, Fehler "operation-not-allowed"

**Lösung:**

1. **Firebase Console öffnen:**
   - Gehen Sie zu: [Firebase Console](https://console.firebase.google.com/)
   - Wählen Sie Ihr Projekt

2. **Authentication aktivieren:**
   - Klicken Sie links im Menü auf **"Authentication"**
   - Falls noch nicht aktiviert: **"Get started"** klicken

3. **Sign-in Method konfigurieren:**
   - Wählen Sie den Tab **"Sign-in method"**
   - Suchen Sie **"Email/Password"**
   - Klicken Sie darauf

4. **Aktivieren:**
   - Schalter auf **"Enable"** (Aktivieren) setzen
   - **"Save"** (Speichern) klicken

5. **Testen:**
   - Zurück zur App
   - Versuchen Sie sich anzumelden
   - Sollte jetzt funktionieren!

---

#### 🔧 Firestore Database einrichten

**Problem:** "Missing or insufficient permissions" Fehler

**Lösung:**

1. **Firestore erstellen (falls nicht vorhanden):**
   
   a) Firebase Console → **Firestore Database**
   
   b) **"Create database"** klicken
   
   c) **"Start in production mode"** wählen
   
   d) Standort wählen (z.B. "europe-west3" für Frankfurt)
   
   e) **"Enable"** klicken

2. **Security Rules konfigurieren:**
   
   a) In Firestore Database → **Rules** Tab
   
   b) **Kopieren Sie die sicheren Rules aus der Datei [`firestore.rules`](firestore.rules) im Repository.**

   > 🚨 **SICHERHEITSWARNUNG:** Verwenden Sie **NIEMALS** die Regel `allow read, write: if true`.
   > - Diese Regel öffnet Ihre **gesamte Datenbank** für alle Personen weltweit – auch ohne Anmeldung.
   > - Jeder kann damit alle Daten lesen, ändern oder löschen, einschließlich Benutzerkonten und Admin-Zugänge.
   > - Sie darf weder in Produktion noch in öffentlich zugänglichen Umgebungen eingesetzt werden.
   >
   > Nutzen Sie ausschließlich die sicheren Rules aus der Datei [`firestore.rules`](firestore.rules). Weitere Informationen: [FIRESTORE_RULES.md](FIRESTORE_RULES.md)

   c) **"Publish"** (Veröffentlichen) klicken

3. **Testen:**
   - App neu laden
   - Anmelden versuchen
   - Rezepte sollten laden

---

#### 🔧 GitHub Pages aktivieren

**Problem:** 404-Fehler auf GitHub Pages URL

**Lösung:**

1. **Repository-Einstellungen öffnen:**
   - Gehen Sie zu: https://github.com/brou-cgn/recipebook
   - Klicken Sie auf **Settings**

2. **Pages konfigurieren:**
   - Links im Menü: **Pages** auswählen
   - Unter "Build and deployment":
   - **Source:** Wählen Sie **"GitHub Actions"**
   - **NICHT** "Deploy from a branch"

3. **Speichern:**
   - Einstellung wird automatisch gespeichert
   - Grüne Bestätigung erscheint

4. **Deployment auslösen:**
   - **Actions** Tab öffnen
   - **"Deploy to GitHub Pages"** auswählen
   - **"Run workflow"** klicken

5. **Warten:**
   - 1-2 Minuten warten
   - Grüner Haken ✅ = Erfolgreich

6. **App öffnen:**
   - https://brou-cgn.github.io/recipebook
   - Sollte jetzt funktionieren!

---

## 📱 Mobile/Tablet: App installieren

Die RecipeBook-App kann wie eine normale App installiert werden!

### Android (Chrome):

1. **App öffnen:** https://brou-cgn.github.io/recipebook
2. **Menü öffnen:** Tippen Sie auf **⋮** (drei Punkte oben rechts)
3. **Installieren:** Wählen Sie **"Zum Startbildschirm hinzufügen"**
4. **Bestätigen:** Tippen Sie auf **"Hinzufügen"**
5. **Fertig!** App-Icon erscheint auf Ihrem Startbildschirm

### iOS (Safari):

1. **App öffnen:** https://brou-cgn.github.io/recipebook
2. **Teilen-Menü:** Tippen Sie auf das **Teilen-Symbol** (Viereck mit Pfeil)
3. **Zum Home:** Scrollen und wählen Sie **"Zum Home-Bildschirm"**
4. **Bestätigen:** Tippen Sie auf **"Hinzufügen"**
5. **Fertig!** App-Icon erscheint auf Ihrem Home-Bildschirm

### Desktop (Chrome/Edge):

1. **App öffnen:** https://brou-cgn.github.io/recipebook
2. **Install-Icon:** Klicken Sie auf das **⊕** oder **🖥️** Symbol in der Adressleiste
3. **Installieren:** Klicken Sie auf **"Installieren"**
4. **Fertig!** App öffnet sich in eigenem Fenster

**💡 Vorteile der Installation:**
- ✅ Schneller Zugriff (wie normale App)
- ✅ Funktioniert offline
- ✅ Kein Browser-Tab nötig
- ✅ Push-Benachrichtigungen (zukünftig)

---

## 🆘 Hilfe benötigt?

### Weitere Dokumentation:

- **[README.md](README.md)** - Allgemeine Infos zur App
- **[FIREBASE_SETUP.md](FIREBASE_SETUP.md)** - Firebase einrichten (technisch)
- **[GITHUB_SECRETS_SETUP.md](GITHUB_SECRETS_SETUP.md)** - Secrets konfigurieren
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Deployment-Infos (technisch)
- **[ZUGRIFFSPROBLEME_ANALYSE.md](ZUGRIFFSPROBLEME_ANALYSE.md)** - Technische Analyse

### Kontakt:

- **Issue erstellen:** https://github.com/brou-cgn/recipebook/issues
- **Administrator fragen:** Kontaktieren Sie den System-Admin

---

## ✅ Checkliste: Erstmalige Einrichtung

Für **Administratoren**, die das System zum ersten Mal einrichten:

- [ ] **Firebase-Projekt erstellt**
  - Firebase Console → Projekt erstellen
  - Web-App registriert

- [ ] **Firestore Database aktiviert**
  - Firestore Database erstellt
  - Standort gewählt (z.B. europe-west3)
  - Security Rules konfiguriert

- [ ] **Authentication aktiviert**
  - Email/Password-Methode aktiviert

- [ ] **GitHub Secrets konfiguriert**
  - Alle 7 REACT_APP_FIREBASE_* Secrets hinzugefügt
  - Werte aus Firebase kopiert

- [ ] **GitHub Pages aktiviert**
  - Settings → Pages → Source: "GitHub Actions"

- [ ] **Deployment erfolgreich**
  - Actions → Grüner Haken ✅
  - App unter URL erreichbar

- [ ] **Erster Admin-Benutzer registriert**
  - Als erster registriert → automatisch Admin
  - Kann sich anmelden

- [ ] **Test-Rezept erstellt**
  - Rezept erfolgreich gespeichert
  - Wird in Liste angezeigt

- [ ] **Weitere Benutzer hinzugefügt**
  - Berechtigungen zugewiesen
  - Funktionieren

**🎉 Geschafft!** System ist einsatzbereit!

---

## 💡 Tipps & Tricks

### Offline-Nutzung:
- ✅ App funktioniert ohne Internet (nach erstem Laden)
- ✅ Änderungen werden gespeichert
- ✅ Synchronisiert automatisch bei Verbindung

### Passwort-Sicherheit:
- ✅ Mindestens 8 Zeichen empfohlen
- ✅ Groß- und Kleinbuchstaben mischen
- ✅ Zahlen und Sonderzeichen verwenden

### Performance:
- ✅ Als App installieren (schneller)
- ✅ Nur ein Browser-Tab öffnen
- ✅ Nicht im Inkognito-Modus (limitiert Offline-Funktion)

### Mehrere Geräte:
- ✅ Gleicher Account auf mehreren Geräten nutzbar
- ✅ Automatische Synchronisation
- ✅ Offline-Änderungen werden gemergt

---

**Viel Erfolg mit RecipeBook! 🍳👨‍🍳👩‍🍳**

*Letzte Aktualisierung: 14. Februar 2026*
