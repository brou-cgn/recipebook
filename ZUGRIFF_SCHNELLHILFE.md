# 🚨 RecipeBook Zugriff - Schnellhilfe

**Kurzübersicht der häufigsten Zugriffsprobleme und Sofortlösungen**

---

## 🎯 Top 5 Probleme & Schnelllösungen

### 1️⃣ Leere Seite / Weiße Seite

**Problem:** GitHub Pages zeigt nur weiße Seite  
**Ursache:** Firebase Secrets fehlen  
**Lösung:**

1. Firebase Console → Projekt → Einstellungen → Config kopieren
2. GitHub Repository → Settings → Secrets → Actions
3. Alle 7 `REACT_APP_FIREBASE_*` Secrets hinzufügen
4. Actions → Deploy workflow neu starten

**📖 Details:** [GITHUB_SECRETS_SETUP.md](GITHUB_SECRETS_SETUP.md)

---

### 2️⃣ Login funktioniert nicht

**Problem:** "Anmeldung fehlgeschlagen"  
**Ursache:** Firebase Authentication nicht aktiviert  
**Lösung:**

1. Firebase Console → Authentication
2. "Get started" klicken
3. Sign-in method → Email/Password → Enable
4. Save → Fertig!

**📖 Details:** [ZUGRIFF_ANLEITUNG.md](ZUGRIFF_ANLEITUNG.md#problem-2-anmeldung-fehlgeschlagen)

---

### 3️⃣ Kann keine Rezepte erstellen

**Problem:** "+ Rezept hinzufügen" Button fehlt  
**Ursache:** Berechtigung nur "Lesen"  
**Lösung:**

1. Administrator kontaktieren
2. Admin: Einstellungen → Benutzerverwaltung
3. 🔐 neben Benutzername → "Bearbeiten" auswählen
4. Bestätigen

**Berechtigungen:**
- 🚶 Gast - nur ansehen
- 👁️ Lesen - nur ansehen
- 💬 Kommentieren - ansehen + kommentieren
- ✏️ Bearbeiten - ansehen + erstellen + eigene bearbeiten
- 👑 Administrator - alles

**📖 Details:** [ZUGRIFF_ANLEITUNG.md](ZUGRIFF_ANLEITUNG.md#problem-3-ich-kann-keine-rezepte-erstellen)

---

### 4️⃣ Registrierung schlägt fehl

**Problem:** Fehler bei Registrierung  
**Ursache:** Firestore Rules zu restriktiv ODER Passwort zu kurz  
**Lösung:**

**Benutzer:**
1. Passwort mindestens 6 Zeichen
2. Alle Felder ausfüllen
3. Beide Passwort-Felder identisch

**Administrator:**
1. Firebase Console → Firestore → Rules
2. Folgende Rule hinzufügen:
```javascript
match /users/{userId} {
  allow create: if true; // Erste Registrierung erlauben
}
```
3. Publish

**📖 Details:** [ZUGRIFFSPROBLEME_ANALYSE.md](ZUGRIFFSPROBLEME_ANALYSE.md#problem-e2-erste-registrierung-unmöglich)

---

### 5️⃣ Rezepte werden nicht angezeigt

**Problem:** Leere Liste trotz Anmeldung  
**Ursache:** Keine Internetverbindung ODER Firestore Rules ODER keine Daten  
**Lösung:**

1. **Internetverbindung prüfen** (beim ersten Besuch erforderlich!)
2. **Angemeldet?** Oben rechts sollte Name stehen
3. **Firestore Rules:** Firebase Console → Firestore → Rules:
```javascript
match /recipes/{recipeId} {
  allow read: if true; // Lesen erlauben
}
```
4. **Gibt es Rezepte?** Erste erstellen (als Admin/Editor)

**📖 Details:** [ZUGRIFF_ANLEITUNG.md](ZUGRIFF_ANLEITUNG.md#problem-5-rezepte-werden-nicht-angezeigt)

---

## 🛠️ Diagnose-Werkzeuge

### Browser Console (F12)

```javascript
// Benutzer-Status prüfen
JSON.parse(sessionStorage.getItem('currentUser'))

// Firebase-Status
console.log(firebase.apps.length > 0 ? 'Connected' : 'Not initialized')
```

### Checkliste: Ist alles konfiguriert?

- [ ] GitHub Pages aktiviert? (Settings → Pages → Source: "GitHub Actions")
- [ ] Alle 7 Firebase Secrets in GitHub? (Settings → Secrets → Actions)
- [ ] Firebase Authentication aktiviert? (Email/Password)
- [ ] Firestore Database erstellt?
- [ ] Firestore Rules konfiguriert?
- [ ] Mindestens ein Benutzer registriert?

---

## 📱 URLs & Links

- **Live App:** https://brou-cgn.github.io/recipebook
- **GitHub Repo:** https://github.com/brou-cgn/recipebook
- **Firebase Console:** https://console.firebase.google.com/

---

## 📚 Vollständige Dokumentation

### Für Benutzer (nicht-technisch):
- **[ZUGRIFF_ANLEITUNG.md](ZUGRIFF_ANLEITUNG.md)** - Komplette Anleitung mit allen Problemen

### Für Admins/Entwickler (technisch):
- **[ZUGRIFFSPROBLEME_ANALYSE.md](ZUGRIFFSPROBLEME_ANALYSE.md)** - Technische Analyse
- **[FIREBASE_SETUP.md](FIREBASE_SETUP.md)** - Firebase einrichten
- **[GITHUB_SECRETS_SETUP.md](GITHUB_SECRETS_SETUP.md)** - Secrets konfigurieren
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Deployment-Details

---

## 🆘 Notfall-Kontakt

**Problem nicht gelöst?**

1. 📖 Vollständige Anleitung lesen: [ZUGRIFF_ANLEITUNG.md](ZUGRIFF_ANLEITUNG.md)
2. 🔍 Technische Analyse checken: [ZUGRIFFSPROBLEME_ANALYSE.md](ZUGRIFFSPROBLEME_ANALYSE.md)
3. 💬 GitHub Issue erstellen: https://github.com/brou-cgn/recipebook/issues
4. 👨‍💻 Administrator kontaktieren

---

## ⚡ Sofort-Tipps

- ✅ **Browser aktualisieren:** Strg+F5 (Windows) / Cmd+Shift+R (Mac)
- ✅ **Anderen Browser testen:** Chrome, Firefox, Edge, Safari
- ✅ **Inkognito-Modus vermeiden:** Limitiert Offline-Funktion
- ✅ **Nur ein Tab öffnen:** Für IndexedDB-Persistence
- ✅ **Als App installieren:** Schneller und zuverlässiger

---

**Letzte Aktualisierung:** 14. Februar 2026  
**Viel Erfolg! 🍳**
