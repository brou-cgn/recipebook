# Firestore Security Rules

This file documents the security rules for the Firestore database that enforce access control for all collections.

## Rollen

| Rolle | Beschreibung |
|-------|--------------|
| `admin` | Voller Zugriff |
| `moderator` | Wie `edit`, zusätzlich Stammdaten (Saisonmatrix, Nährwert-Referenzen, Getränkegewichte, Kochatelier-Texte, Cuisine-Vorschläge) |
| `edit` | Darf Rezepte, Menüs, Einkaufslisten, Tutorials anlegen und ändern |
| `comment` | Aktuell wie `read` |
| `read` | Lesen, eigene Daten (Favoriten, Kochdaten, Events) pflegen |
| Gast | Anonyme Anmeldung („Als Gast anmelden"): kein `users`-Dokument, kein direkter Zugriff auf `recipes`; Rezepte kommen über Cloud Functions mit Serverfilter |

„Mitglied" (`isMember()`) heißt: angemeldet, nicht anonym, Rolle `read` oder höher.

## Hilfsfunktionen in `firestore.rules`

`isAuthenticated()`, `userRole()`, `isAnyUser()` (angemeldet mit Rolle, oder noch ohne Profil, **schließt anonyme Gäste ein**), `isEditOrAdmin()`, `isModeratorOrAdmin()`, `isAdmin()`, `isAnonymous()`, `isMember()`, `canSeeAppCalls()`, `canSeeEventplanung()` (beide prüfen `rolePermissions/{rolle}`).

## Zugriff pro Collection

Quelle ist immer `firestore.rules` bzw. `storage.rules`; diese Tabelle gibt den Stand vom 30.10.2026 wieder und wird durch `rules-tests/` abgesichert (siehe unten). `src/securityDocsPolicy.test.js` prüft, dass jeder `match`-Block beider Regeldateien hier steht (Tech-Check D5).

| Collection | Lesen | Schreiben |
|------------|-------|-----------|
| `recipes` | Mitglieder und Nutzer ohne Profil (nicht anonym). **Sichtbarkeit (Entwurf, Gruppe) wird nur im Client gefiltert.** | Anlegen/Löschen/Ändern: `edit`, `moderator`, `admin`. Das Flag `importOrigin: 'shortcut'` (Import-Jobs der Kurzbefehl-Endpunkte) darf ein Client weder anlegen noch neu setzen (Tech-Check S20); ein vorhandenes bleibt bei Updates unberührt |
| `recipes/{id}/ratings` | alle (öffentlich) | Anlegen: angemeldet, eigener Schlüssel oder `guest_…`; Ändern: nur eigener Schlüssel; Löschen: eigener, Gast-Schlüssel, Editoren |
| `menus` | `isAnyUser()` oder Freigabelink (`shareId`) | `edit`, `moderator`, `admin` |
| `groups` | öffentliche Systemgruppe für `isAnyUser()` (Gäste eingeschlossen); private Listen nur Eigentümer, Mitglieder und Admins (Tech-Check S16) | `edit`+; jedes Mitglied seine eigene Liste „Für dich entdeckt"; Löschen nur `edit`+ |
| `shoppingLists`, `tutorials` | `isAnyUser()` | `edit`+ |
| `seasonMatrix`, `drinkWeights`, `drinkWeightsChildren` | `isAnyUser()` | `moderator`, `admin` |
| `discoverTopics` | einzelne Themen `isAnyUser()`, Auflisten nur Admin | Admin |
| `faqs`, `categoryImages`, `rolePermissions`, `appSettings` | `isAnyUser()` | Admin |
| `settings` | `isAnyUser()`; `settings/app` und `settings/images` auch öffentlich | Admin; `edit`+ nur bestimmte Listenfelder, `moderator` zusätzlich Kochatelier-Texte |
| `settings/app/aiPromptHistory` | Admin | Anlegen und Löschen: Admin; Ändern: niemand (Einträge unveränderlich). Die Migration in `functions/shared/gemini.js` schreibt per Admin SDK |
| `nutritionReferences`, `commonTerms`, `buttonIcons`, `customLists`, `appConfig/nutritionReferences` | öffentlich (Freigabelink-Betrachter brauchen sie) | `moderator`/`admin` (Icons, Listen: Admin; `appConfig`: nur Cloud Function) |
| `users/{uid}` | Eigentümer, Admin | Eigentümer ändert alles außer `role`; Anlegen nur mit `role == 'read'`, nicht anonym; Löschen Admin |
| `publicProfiles/{uid}` | angemeldet (**schließt Gäste ein**) | Admin und `syncPublicProfile` (Cloud Function) |
| `users/{uid}/favorites`, `menuFavorites`, `erfahrungswerte`, `guestProfiles` | Eigentümer | Eigentümer (`erfahrungswerte`, `guestProfiles`: nur Cloud Function) |
| `users/{uid}/events` | Eigentümer, Admin | Eigentümer, Admin |
| `users/{uid}/customDrinks` | `isAnyUser()` | Eigentümer, Admin |
| `users/{uid}/security/webImportPin` | niemand (nur Cloud Function) | niemand |
| `guests/{uid}/profiles` | Eigentümer, Admin | niemand (nur Cloud Function) |
| `kalibrierungsSnapshots` | Rollen mit Berechtigung `eventplanung`, Admin | niemand (nur Cloud Function) |
| `appCalls` | Rollen mit Berechtigung `appCalls`, Admin | Anlegen: eigene Sitzung; Ändern/Löschen: Admin |
| `recipeCalls` | Mitglieder | Anlegen: eigene Sitzung; Ändern/Löschen: Admin |
| `cookDates` | Mitglieder (**jedes Mitglied liest alle Einträge**) | Anlegen: eigene `userId`, nur die Felder `userId`, `recipeId`, `date` (nicht in der Zukunft), `createdAt`; Löschen: Eigentümer, `edit`+; kein Ändern |
| `cookingTimerAlarms` | niemand | Anlegen: Mitglieder, eigene `uid`, ID beginnt mit der uid, nur `uid`, `token` (≤ 4.096 Zeichen), `dueAt` (höchstens 24 h voraus), `body` (≤ 200 Zeichen), `createdAt`; Löschen: Eigentümer, auch ein schon verschickter (nicht mehr vorhandener) Weckruf; kein Ändern. Die Function `sendDueCookingTimerAlarms` sendet nur an Tokens aus `users/{uid}.timerPushTokens` (Tech-Check P8) |
| `cookingSessions` | Eigentümer (Mitglieder, keine Gäste) | Schreiben: Eigentümer, nur `recipes` (Liste, ≤ 12), `activeRecipeId`, `deviceId` (≤ 64 Zeichen), `updatedAt`; Löschen: Eigentümer. Hält die Kochsitzung (Rezept-IDs, Schritt, vorn stehendes Rezept) zwischen Geräten synchron |
| `follows` | Beteiligte (Follower, Gefolgter), nur Mitglieder | Löschen: beide Seiten; Anlegen/Ändern: niemand (nur Callables `requestFollow`, `respondFollow`) |
| `users/{uid}/followInbox` | Eigentümer (offene Anfragen an ihn) | niemand (nur Cloud Function) |
| `users/{uid}/followBlocks` | Eigentümer (von ihm blockierte Personen) | niemand (nur Cloud Function) |
| `users/{uid}/fuerDichEntdeckt` | Eigentümer, nur Mitglieder | niemand (nur Cloud Function) |
| `followCooldowns`, `followLimits`, `listPushLimits` | niemand | niemand (nur Cloud Function) |
| `recipeSwipeFlags` | Eigentümer, Mitglieder derselben Liste | Eigentümer; Listenmitglieder nur `calculatedFlag`, `calculatedExpiresAt` |
| `aiScanLimits` | `edit`+ | Admin |
| `aiNutritionLimits`, `aiRephraseLimits`, `aiVersionLimits`, `importSweeperLimits` | niemand | niemand (nur Cloud Function) |
| `jobRequests`, `invitations` | niemand (nur Cloud Functions) | niemand |
| `failedWebImports` | Admin | Anlegen: `isAnyUser()`; sonst Admin |
| `cuisineProposals` | `isAnyUser()` | Anlegen: `edit`+ (nicht freigegeben); Ändern: Autor oder `moderator`+; Löschen: `moderator`+ |
| Collection-Group `events`, `profiles` | Admin | |
| Collection-Group `customDrinks` | `isAnyUser()` | |
| Storage `recipes/` (Rezeptbilder, `storage.rules`) | öffentlich | `edit`+ |
| Storage `thumbnails/` (Vorschaubilder) | öffentlich | `edit`+ |
| Storage `settings/` (Favicon, App-Logo) | öffentlich | Admin |
| Storage `drinks/{uid}/` (Getränkebilder) | öffentlich | Anlegen: nur das Mitglied selbst (nicht anonym), nur Bilder bis 5 MB; Löschen: Eigentümer oder Admin (Tech-Check S25) |
| Storage `drinks/` (Altbestand vor S25, ohne uid im Pfad) | öffentlich | Löschen: Admin; Anlegen: niemand |

## KI-Functions (Cloud Functions mit Gemini)

Die Prüfung liegt serverseitig in `functions/index.js`, nicht nur in der UI:

- **Rolle ab `edit`** (`requireAiCaller`), sonst `permission-denied`. Schlägt die Rollenabfrage fehl, wird der Aufruf abgelehnt.
- **Import-Functions** (`scanRecipeWithAI`, `scanRecipesWithAI`, `processHtmlWithAI`, `scrapeInstagramReel`, `importRecipeCallable`, `fetchRecipeHtml`, `captureWebsiteScreenshot`): zusätzlich muss die Rolle in `rolePermissions/{rolle}` mindestens eines von `fotoscan`, `webimport`, `recipeImport` haben (`requireRoleFeature`, wie `applyRolePermissionsToUser` im Client). Admins sind ausgenommen, ebenso das Konto des nächtlichen Importer-Tests. Die drei Flags lassen sich nicht trennen, weil ein Webimport auch einen Screenshot scannt und der Universalimport alle Functions nutzt.
- **`applyRecipeVersionChanges`** (Beschreibung einer eigenen Version einarbeiten): zusätzlich muss die Rolle `versionDictation` in `rolePermissions/{rolle}` haben (`requireRoleFeature`, Admins ausgenommen). Die Beschreibung und das Rezept werden nicht gespeichert, nur der Tageszähler.
- **Tageslimits** je Person und Berliner Tag, Zähler nur per Admin SDK: `aiScanLimits` (Scans und Importe, auch für die Kurzbefehl-Endpunkte), `aiRephraseLimits` (Umformulieren), `aiVersionLimits` (`applyRecipeVersionChanges`, Admin 1000, Moderator 100, Mitglied 40), `aiNutritionLimits` (`parseIngredientAmountG`, `calculateNutritionFromOpenFoodFacts`, `generateNutritionFromReference`; Admin 5000, Moderator 1000, Mitglied 500). Ist der Zähler nicht prüfbar, wird der Aufruf abgelehnt. Der Import-Sweeper `recoverStuckImportJobs` hat einen eigenen Zähler `importSweeperLimits` (20 Neustarts je Autor und Tag, Tech-Check S21), damit hängengebliebene App-Imports nicht gegen das Scan-Limit zählen; ist er nicht prüfbar, bleibt der Job liegen und wird im nächsten Lauf erneut geprüft.

## Bekannte Lücken

Die Tests in `rules-tests/access.test.js` halten diese Zustände fest (sie ersetzen das frühere Skript `scripts/testFirestoreRules.mjs`, dessen Fälle übernommen sind) (Name enthält „BEKANNTE LÜCKE"). Wer eine Lücke schließt, kehrt den Test um.

1. **`recipes`:** Jedes Mitglied kann auch Entwürfe und Rezepte privater Listen anderer lesen. Regeln filtern keine Abfragen, und der Client lädt die ganze Collection (`subscribeToRecipes`). Schließen geht nur über einen Umbau der Abfragen im Client. Gäste und Abgemeldete lesen `recipes` nicht mehr direkt (PR #3426), das Mitglieder-Rest ist laut Tech-Check S2 eine bewusste Entscheidung des Betreibers vom 14.10.2026.
2. **`groups` (Rest nach S16):** Gäste und fremde Mitglieder lesen private Listen nicht mehr. Mitglieder einer Liste sehen aber weiterhin deren `invitedEmails` (E-Mail-Adressen noch nicht registrierter Eingeladener). Schließen ginge nur durch Verlagern in eine nur per Cloud Function lesbare Collection, samt Umbau von `GroupDetail.js` und dem Registrierungs-Trigger (`functions/index.js`, `invitedEmails`).
3. **`publicProfiles`:** Auch anonyme Gäste lesen Vor- und Nachnamen aller Mitglieder. Einschränken auf Mitglieder würde Gästen die Autorennamen nehmen.
4. **`cookDates`:** Jedes Mitglied liest alle Einträge (gewollt für den Kochbuch-Dialog, aber Datenschutz-relevant). Anonyme Gäste dürfen eigene Einträge anlegen.
5. **Import-Jobs und KI-Limit (Tech-Check S21, begrenzt):** `recoverStuckImportJobs` führt jedes temporäre Rezept (`isTemp`, `importStatus` queued/processing/error, Heartbeat älter als 5 Minuten) mit Gemini aus, ohne Prüfung von `importOrigin`. Die In-App-Import-Queue legt solche Dokumente selbst an, die Regeln können sie nicht sperren. Ein Mitglied ab `edit` kann so weiter Gemini-Läufe anstoßen, aber nur noch bis zum Sweeper-Tageslimit von 20 Neustarts je Autor (vorher rund 2.900 am Tag insgesamt). Dieses Limit ist vom Scan-Limit getrennt: wer es nutzt, umgeht das Scan-Limit nicht mehr unbegrenzt, hat aber zusätzlich zu diesem ein eigenes Budget.

## Tests der Regeln

`rules-tests/` enthält Tests gegen den Firestore- und den Storage-Emulator (`@firebase/rules-unit-testing`; `storage.test.js` für `storage.rules`). Sie laufen in der CI (Job „Firestore Rules") und lokal:

```bash
cd rules-tests
npm ci
npm test   # startet den Emulator, braucht Java 21
```

Neue oder geänderte Regeln brauchen einen Test pro Rolle (nicht angemeldet, anonym, Mitglied, Editor, Admin), jeweils mit Erlaubt- und Verboten-Fall.

## Deployment

To deploy these security rules to Firebase:

1. Make sure you have the Firebase CLI installed:
   ```bash
   npm install -g firebase-tools
   ```

2. Login to Firebase:
   ```bash
   firebase login
   ```

3. Initialize Firebase in the project (if not already done):
   ```bash
   firebase init
   ```
   Select Firestore when prompted and use the existing `firestore.rules` file.

4. Deploy the security rules:
   ```bash
   firebase deploy --only firestore:rules
   ```

## Testing

You can test the security rules locally using the Firebase Emulator:

```bash
firebase emulators:start
```

## Important Notes

- These rules work in conjunction with the client-side filtering implemented in the application
- Client-side filtering provides immediate UX feedback
- Server-side rules (Firestore) provide the actual security enforcement
- Both layers are necessary for proper security and user experience

## Technische Analyse: Zugriffsprobleme RecipeBook

_Quelle: `ZUGRIFFSPROBLEME_ANALYSE.md` (zusammengeführt)._

> **⚠️ Historisches Dokument.** Diese Analyse stammt vom 14. Februar 2026 und
> beschreibt den Betrieb auf GitHub Pages. Seit März 2026 läuft die App auf
> Firebase Hosting (<https://broubook.web.app>); alle Pages-spezifischen
> Fehlerbilder und Lösungswege unten sind damit gegenstandslos. Aktuell gültig
> sind [DEPLOYMENT.md](../setup/deployment.md) und
> [ZUGRIFF_SCHNELLHILFE.md](../user/zugriff.md).

### 🔍 Übersicht

Dieses Dokument analysiert potenzielle Zugriffsprobleme beim RecipeBook-System und deren technische Ursachen. Es richtet sich an Entwickler und technisch versierte Administratoren.

**Analysedatum:** 14. Februar 2026  
**System:** RecipeBook Progressive Web App  
**Technologie-Stack:** React 19, Firebase (Firestore + Authentication), GitHub Pages

---

### 1. Systemarchitektur-Übersicht

#### 1.1 Hauptkomponenten

```
┌─────────────────────────────────────────────────┐
│                   Browser                        │
│  ┌───────────────────────────────────────────┐  │
│  │        RecipeBook React App               │  │
│  │  ┌──────────────┐  ┌──────────────────┐  │  │
│  │  │  Login/Auth  │  │  Recipe Display  │  │  │
│  │  └──────────────┘  └──────────────────┘  │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
           ▲                         ▲
           │ Auth                    │ Data
           ▼                         ▼
┌─────────────────────────────────────────────────┐
│              Firebase Services                   │
│  ┌──────────────┐      ┌──────────────────────┐ │
│  │ Authentication│      │  Firestore Database  │ │
│  │  (Email/PW)  │      │  (Recipes, Users)    │ │
│  └──────────────┘      └──────────────────────┘ │
└─────────────────────────────────────────────────┘
```

#### 1.2 Authentifizierungsfluss

1. **Benutzer öffnet App** → Lädt von GitHub Pages
2. **Firebase Auth prüft Session** → Validiert gespeicherte Anmeldung
3. **Bei Erfolg** → Lädt Benutzerdaten aus Firestore
4. **Bei Fehler** → Zeigt Login-Bildschirm

---

### 2. Identifizierte Problemkategorien

#### 2.1 ❌ Deployment-bezogene Probleme

##### Problem A1: Leere Seite nach Deployment
**Symptom:** GitHub Pages zeigt leere weiße Seite  
**Ursache:** Firebase-Umgebungsvariablen fehlen in GitHub Actions  
**Technische Details:**
- Die `.env.local`-Datei wird nicht ins Repository committed (gitignore)
- GitHub Actions benötigt Secrets für Firebase-Konfiguration
- Ohne diese Secrets schlägt die Firebase-Initialisierung fehl

**Code-Referenz:** `src/firebase.js`, Zeilen 22-29
```javascript
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  throw new Error('Firebase configuration is missing!');
}
```

**Lösung:** Siehe `GITHUB_SECRETS_SETUP.md`

##### Problem A2: 404-Fehler auf GitHub Pages
**Symptom:** Seite nicht erreichbar  
**Ursache:** GitHub Pages nicht korrekt konfiguriert  
**Lösung:**
- Settings → Pages → Source: "GitHub Actions" auswählen
- Nicht "Deploy from a branch" verwenden

---

#### 2.2 🔐 Firebase Authentication Probleme

##### Problem B1: Login funktioniert nicht
**Symptome:**
- "Anmeldung fehlgeschlagen" Fehlermeldung
- Benutzer wird nicht angemeldet
- Fehler in Browser-Konsole

**Mögliche Ursachen:**

1. **Firebase Authentication nicht aktiviert**
   - **Prüfung:** Firebase Console → Authentication → Sign-in method
   - **Erforderlich:** Email/Password aktiviert
   - **Fehlercode:** `auth/operation-not-allowed`

2. **Falsche Zugangsdaten**
   - **Prüfung:** Email-Adresse korrekt geschrieben?
   - **Häufig:** Leerzeichen am Anfang/Ende (wird automatisch getrimmt)
   - **Code:** `src/components/Login.js`, Zeile 17

3. **Benutzer existiert nicht in Firestore**
   - **Prüfung:** Firebase Console → Firestore → Collection "users"
   - **Problem:** Inkonsistenz zwischen Auth und Firestore
   - **Code:** `src/utils/userManagement.js`

4. **Firestore Security Rules zu restriktiv**
   - **Symptom:** "Missing or insufficient permissions"
   - **Prüfung:** Firebase Console → Firestore → Rules
   - **Erforderlich:** Authentifizierte Benutzer müssen lesen können

**Code-Analyse - Login-Prozess:**
```javascript
// src/utils/userManagement.js
export async function loginUser(email, password) {
  // 1. Hash-Passwort für Vergleich
  const hashedPassword = await hashPassword(password);
  
  // 2. Suche Benutzer in Firestore
  const userDoc = await getDoc(doc(db, 'users', email));
  
  // 3. Validiere Passwort
  if (userDoc.data().password !== hashedPassword) {
    return { success: false, message: 'Falsches Passwort' };
  }
  
  // 4. Speichere Session
  sessionStorage.setItem('currentUser', JSON.stringify(userData));
}
```

##### Problem B2: Registrierung schlägt fehl
**Symptome:**
- Neuer Benutzer kann nicht erstellt werden
- Fehlermeldung bei Registrierung

**Mögliche Ursachen:**

1. **Firestore Write-Berechtigung fehlt**
   ```javascript
   // Firestore Rules müssen CREATE erlauben:
   match /users/{userId} {
     allow create: if request.auth != null || !exists(/databases/$(database)/documents/users/$(userId));
   }
   ```

2. **Email bereits vergeben**
   - **Prüfung:** Firestore Collection "users" nach Email durchsuchen

3. **Passwort-Anforderungen nicht erfüllt**
   - **Mindestlänge:** 6 Zeichen (Firebase Standard)

##### Problem B3: Erster Benutzer wird nicht als Admin erstellt
**Symptom:** Erster Benutzer hat nur "Lesen"-Rechte  
**Ursache:** Logik-Fehler in Registrierung  
**Code-Referenz:** `src/utils/userManagement.js`

```javascript
export async function registerUser(userData) {
  const usersSnapshot = await getDocs(collection(db, 'users'));
  const isFirstUser = usersSnapshot.empty;
  
  const newUser = {
    ...userData,
    permission: isFirstUser ? 'administrator' : 'read',
    // ...
  };
}
```

**Prüfung:**
1. Firebase Console → Firestore → users
2. Ist Collection leer? → Erster Benutzer sollte "administrator" sein
3. Ansonsten → Manuell Berechtigung ändern

---

#### 2.3 🔒 Berechtigungsprobleme

##### Problem C1: Benutzer kann keine Rezepte erstellen
**Symptom:** "Rezept hinzufügen"-Button nicht sichtbar oder funktionslos  
**Ursache:** Unzureichende Benutzerberechtigungen

**Berechtigungshierarchie:**
```
Administrator > Bearbeiten > Kommentieren > Lesen > Gast
```

**Code-Analyse - Berechtigungsprüfung:**
```javascript
// src/utils/userManagement.js
export function hasPermission(user, requiredPermission) {
  const hierarchy = ['guest', 'read', 'comment', 'edit', 'administrator'];
  const userLevel = hierarchy.indexOf(user?.permission || 'guest');
  const requiredLevel = hierarchy.indexOf(requiredPermission);
  return userLevel >= requiredLevel;
}
```

**Erforderliche Berechtigung für:**
- Rezepte erstellen: `edit` oder höher
- Rezepte bearbeiten: `edit` oder höher (eigene) / `administrator` (alle)
- Rezepte löschen: `administrator`
- Benutzer verwalten: `administrator`

**Lösung:**
1. Als Administrator anmelden
2. Einstellungen → Benutzerverwaltung
3. Berechtigung ändern: 🔐-Symbol → "Bearbeiten" auswählen

##### Problem C2: Gastmodus-Beschränkungen
**Symptom:** Als Gast sehr eingeschränkte Funktionen  
**Erklärung:** Beabsichtigtes Verhalten

**Gast-Berechtigungen:**
- ✅ Rezepte ansehen
- ❌ Rezepte erstellen/bearbeiten/löschen
- ❌ Favoriten speichern (nur temporär in Session)
- ❌ Menüs erstellen

---

#### 2.4 🌐 Netzwerk- und Offline-Probleme

##### Problem D1: Daten werden nicht geladen
**Symptom:** Rezeptliste bleibt leer, trotz Anmeldung  
**Ursachen:**

1. **Keine Internetverbindung**
   - **Prüfung:** Browser DevTools → Network Tab
   - **Offline:** Firestore lädt aus IndexedDB Cache
   - **Problem:** Beim ersten Besuch keine Daten im Cache

2. **Firestore Read-Berechtigung fehlt**
   ```javascript
   // Firestore Rules
   match /recipes/{recipeId} {
     allow read: if request.auth != null; // Muss gesetzt sein!
   }
   ```

3. **Firebase-Konfiguration fehlerhaft**
   - **Symptom:** Fehler in Console: "Firebase: Error"
   - **Prüfung:** Alle 7 Umgebungsvariablen korrekt?

**Debug-Schritte:**
```javascript
// Browser Console:
console.log('Firebase Config:', {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY ? 'SET' : 'MISSING',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID ? 'SET' : 'MISSING'
});
```

##### Problem D2: Offline-Synchronisation schlägt fehl
**Symptom:** Offline erstellte Rezepte werden nicht synchronisiert  
**Ursache:** IndexedDB Persistence nicht aktiviert oder Browser unterstützt es nicht

**Code-Referenz:** `src/firebase.js`, Zeilen 41-49
```javascript
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    // Mehrere Tabs offen - nur ein Tab kann Persistence nutzen
  } else if (err.code === 'unimplemented') {
    // Browser unterstützt Persistence nicht
  }
});
```

**Lösung:**
- Nur ein Browser-Tab öffnen
- Modernen Browser verwenden (Chrome, Firefox, Safari)
- Private/Inkognito-Modus vermeiden (kann IndexedDB blockieren)

---

#### 2.5 🗄️ Firestore Security Rules Probleme

##### Problem E1: "Missing or insufficient permissions"
**Symptom:** Fehler beim Lesen/Schreiben von Daten  
**Ursache:** Firestore Security Rules zu restriktiv oder falsch konfiguriert

> 🚨 **SICHERHEITSWARNUNG:** Verwenden Sie in Konfigurationsbeispielen **niemals** Regeln wie `allow create: if true`, `allow read, write: if true` oder `allow create: if !exists(...)` ohne vollständige Authentifizierungs- und Feldprüfung. Solche Regeln erlauben es jedem, beliebige Dokumente anzulegen – einschließlich Fake-Admin-Accounts.

**Sichere Minimal-Rules für RecipeBook:**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Hilfsfunktion
    function isSignedIn() {
      return request.auth != null;
    }
    
    // Rezepte
    match /recipes/{recipeId} {
      allow read: if isSignedIn();
      allow create, update, delete: if isSignedIn();
    }
    
    // Benutzer – nur eigenes Dokument, keine Rolle client-seitig setzbar
    match /users/{userId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn()
                    && request.auth.uid == userId
                    && request.resource.data.role == 'read';
      allow update: if isSignedIn() && request.auth.uid == userId;
    }
    
    // Menüs
    match /menus/{menuId} {
      allow read: if isSignedIn();
      allow create, update, delete: if isSignedIn();
    }
    
    // User-spezifische Daten
    match /userFavorites/{userId} {
      allow read, write: if isSignedIn() && request.auth.uid == userId;
    }
    
    match /menuFavorites/{userId} {
      allow read, write: if isSignedIn() && request.auth.uid == userId;
    }
    
    match /customLists/{userId} {
      allow read, write: if isSignedIn() && request.auth.uid == userId;
    }
  }
}
```

**Sichere Rules für RecipeBook:**

> 🚨 **SICHERHEITSWARNUNG:** Verwenden Sie **NIEMALS** Regeln wie `allow read: if true`, `allow create: if true` oder `allow read, write: if true`.
> - Solche Regeln öffnen Ihre Datenbank für **jeden weltweit** – auch ohne Anmeldung.
> - Angreifer können damit beliebige Nutzer-Dokumente anlegen, einschließlich Admin-Accounts.
>
> Nutzen Sie ausschließlich die authentifizierungsbasierten Rules aus der Datei [`firestore.rules`](../../firestore.rules) im Repository.

Die sichere Konfiguration für die `users`-Collection verhindert, dass Clients eine privilegierte Rolle selbst setzen können. Admin ist ausschließlich `role == 'admin'`; ein separates `isAdmin`-Feld gibt es nicht mehr. Die Erkennung des ersten Administrators erfolgt atomisch durch die `createUserProfile` Cloud Function:
```javascript
// Sichere Rules – Feldwerte auf client-seitig erstellten Dokumenten einschränken
match /users/{userId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null
                && request.auth.uid == userId
                && request.resource.data.role == 'read';
  allow update: if request.auth != null && request.auth.uid == userId;
  allow delete: if false; // Nur Admins via Admin SDK
}
```
Die vollständigen, produktionsreifen Regeln befinden sich in [`firestore.rules`](../../firestore.rules). Weitere Dokumentation: [FIRESTORE_RULES.md](#)

##### Problem E2: Erste Registrierung unmöglich
**Symptom:** Registrierung schlägt fehl mit Permission Error  
**Ursache:** Security Rules erlauben kein CREATE ohne Authentication

**Lösung:** Stellen Sie sicher, dass Firebase Authentication (Email/Password) aktiviert ist. Die App erstellt zunächst einen Firebase Auth-Account (client-seitig) und delegiert dann die Firestore-Profilerstellung an die `createUserProfile` Cloud Function:
- Die Cloud Function prüft atomar, ob bereits Benutzer existieren
- Der erste Benutzer erhält automatisch Admin-Rechte (serverseitig, ohne Race Condition)
- Alle weiteren Benutzer erhalten die Rolle `read`

> ⚠️ **Wichtig:** `allow create: if true` und die client-seitige `isFirstUser()`-Prüfung dürfen **nicht** verwendet werden – ersteres ermöglicht die Anlage beliebiger Admin-Accounts ohne Anmeldung, letzteres ist anfällig für Race Conditions bei gleichzeitigen Registrierungen.

---

### 3. Diagnostik-Werkzeuge

#### 3.1 Browser Developer Tools

##### Console-Überprüfung
```javascript
// Öffne Browser Console (F12)

// 1. Firebase-Status prüfen
console.log('Firebase initialized:', !!window.firebase);

// 2. Benutzer-Status prüfen
const user = sessionStorage.getItem('currentUser');
console.log('Current User:', user ? JSON.parse(user) : 'Not logged in');

// 3. Umgebungsvariablen prüfen (nur lokal)
console.log('API Key configured:', process.env.REACT_APP_FIREBASE_API_KEY ? 'Yes' : 'No');
```

##### Network-Überprüfung
1. Browser DevTools öffnen (F12)
2. Network Tab auswählen
3. Filter: `firestore` oder `googleapis`
4. Reload der Seite
5. Prüfen:
   - Status Codes (200 = OK, 401 = Unauthorized, 403 = Forbidden)
   - Response Bodies für Fehlerdetails

##### Application/Storage Überprüfung
1. DevTools → Application Tab
2. **Session Storage:**
   - Prüfe `currentUser` Eintrag
   - Enthält Benutzerdaten und Berechtigungen
3. **IndexedDB:**
   - `firebaseLocalStorageDb` → Offline-Daten
4. **Service Worker:**
   - Status: Activated/Running?
   - Cached Resources vorhanden?

#### 3.2 Firebase Console Diagnostik

##### Authentication-Check
1. Firebase Console → Authentication
2. Sign-in method: Email/Password aktiviert? ✅
3. Users: Registrierte Benutzer sichtbar? (Bei Custom Auth: Nein)

##### Firestore-Check
1. Firebase Console → Firestore Database
2. Collections prüfen:
   - `users`: Benutzereinträge vorhanden?
   - `recipes`: Rezepte vorhanden?
3. **Dokument-Struktur User:**
   ```json
   {
     "email": "user@example.com",
     "firstName": "Max",
     "lastName": "Mustermann",
     "password": "hashed_password_string",
     "permission": "administrator",
     "requiresPasswordChange": false,
     "createdAt": "2026-02-14T10:00:00.000Z"
   }
   ```

##### Rules Testing
Firebase Console → Firestore → Rules → Rules Playground

**Test Read:**
```
Location: /recipes/test123
Auth: Custom → UID: test@example.com
Operation: get
```

**Test Create:**
```
Location: /users/newuser@example.com
Auth: Unauthenticated
Operation: create
```

#### 3.3 GitHub Actions Logs

**Deployment-Fehler diagnostizieren:**

1. Repository → Actions Tab
2. Neuester Workflow "Deploy to GitHub Pages"
3. Build-Job auswählen
4. **Häufige Fehler:**
   - `Firebase configuration is missing` → Secrets nicht gesetzt
   - `npm run build failed` → Dependencies-Problem
   - `Permission denied` → Workflow-Berechtigungen fehlen

**Secret-Überprüfung:**
```yaml
## .github/workflows/deploy.yml
env:
  REACT_APP_FIREBASE_API_KEY: ${{ secrets.REACT_APP_FIREBASE_API_KEY }}
  # ... alle 7 Secrets müssen hier sein
```

Settings → Secrets → Actions → Alle 7 REACT_APP_FIREBASE_* vorhanden?

---

### 4. Lösungsmatrix

| Problem | Symptom | Schnelltest | Lösung |
|---------|---------|-------------|--------|
| **Leere Seite** | Weiße Seite nach Deployment | Console: Firebase Error? | GitHub Secrets konfigurieren |
| **Login fehlschlägt** | "Anmeldung fehlgeschlagen" | Firebase Console → Authentication aktiviert? | Email/Password aktivieren |
| **Kein Rezept-Erstellen** | Button nicht sichtbar | User Permission in Console checken | Admin: Berechtigung auf "edit" setzen |
| **Registrierung unmöglich** | Permission Error | Firestore Rules prüfen | Sichere Rules aus `firestore.rules` deployen; Firebase Auth aktivieren |
| **Daten laden nicht** | Leere Liste trotz Login | Network Tab: 403 Fehler? | Firestore Rules: `allow read` prüfen |
| **Offline nicht funktioniert** | App funktioniert nicht ohne Internet | Browser: IndexedDB unterstützt? | Modernen Browser nutzen, ein Tab |
| **404 auf GitHub Pages** | Seite nicht gefunden | GitHub Settings → Pages | Source: "GitHub Actions" setzen |
| **First Admin nicht erstellt** | Erster User kein Admin | Firestore: users collection leer vor Registrierung? | Manuell permission ändern |

---

### 5. Präventive Maßnahmen

#### 5.1 Deployment-Checkliste

Vor jedem Deployment prüfen:

- [ ] Alle 7 GitHub Secrets konfiguriert
- [ ] GitHub Pages aktiviert (Source: GitHub Actions)
- [ ] Lokaler Build erfolgreich (`npm run build`)
- [ ] `.env.local` existiert (nur lokal!)
- [ ] Firebase Console: Authentication aktiviert
- [ ] Firebase Console: Firestore erstellt
- [ ] Firestore Security Rules published

#### 5.2 Firebase-Setup-Checkliste

Bei neuem Firebase-Projekt:

- [ ] Projekt erstellt in Firebase Console
- [ ] Web-App registriert
- [ ] Firestore Database erstellt
- [ ] Authentication: Email/Password aktiviert
- [ ] Security Rules konfiguriert und published
- [ ] Umgebungsvariablen kopiert (lokal + GitHub)
- [ ] Standort gewählt (z.B. europe-west3)

#### 5.3 Benutzer-Onboarding-Checkliste

Neuer Benutzer:

- [ ] App-URL öffnen (https://brou-cgn.github.io/recipebook)
- [ ] **Erster Benutzer:** Registrieren → wird automatisch Admin
- [ ] **Weitere Benutzer:** Registrieren → erhalten "Lesen"-Rechte
- [ ] Admin vergibt Berechtigungen über Benutzerverwaltung
- [ ] Gast-Zugang: "Als Gast anmelden" nutzen (temporär)

#### 5.4 Monitoring und Wartung

Regelmäßige Checks (empfohlen: monatlich):

- [ ] GitHub Actions: Alle Deployments erfolgreich?
- [ ] Firebase Console: Quota-Nutzung überprüfen
- [ ] Firestore: Inaktive Benutzer deaktivieren
- [ ] Security Rules: Auf Aktualität prüfen
- [ ] Browser-Kompatibilität testen

---

### 6. Kritische Sicherheitshinweise

#### 6.1 Custom Authentication System

⚠️ **Wichtig:** RecipeBook nutzt ein **Custom Authentication System** anstelle von Firebase Authentication:

**Architektur:**
- Passwörter werden client-seitig gehasht (SHA-256)
- Hashes werden in Firestore gespeichert
- Session-Management über sessionStorage
- Kein Firebase Auth Token

**Sicherheitsimplikationen:**
1. ❌ **Client-seitiges Hashing ist nicht sicher** für Produktion
   - Hashes können abgefangen werden
   - Keine Salt-Verwendung
   - Replay-Attacken möglich

2. ✅ **Für Demo/private Nutzung akzeptabel**
   - Einfache Implementierung
   - Keine Serverkosten
   - Firestore Rules als zusätzlicher Schutz

**Empfehlung für Produktion:**
```javascript
// Migration zu Firebase Authentication
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

// Statt Custom Hash:
await createUserWithEmailAndPassword(auth, email, password);
await signInWithEmailAndPassword(auth, email, password);
```

#### 6.2 Firestore Security Rules

> 🚨 **SICHERHEITSWARNUNG:** Verwenden Sie **niemals** Regeln wie `allow read, write: if true`, `allow create: if true` oder `allow read: if true` ohne Authentifizierungsprüfung. Solche Regeln geben jedem – auch nicht angemeldeten Personen – vollen Zugriff auf alle Daten.

**Korrekte Vorgehensweise:** Verwenden Sie die in [`firestore.rules`](../../firestore.rules) hinterlegten, authentifizierungsbasierten Rules und deployen Sie diese mit `firebase deploy --only firestore:rules`. Details: [FIRESTORE_RULES.md](#)

#### 6.3 Umgebungsvariablen

✅ **Richtig:**
- `.env.local` in `.gitignore`
- Secrets in GitHub Actions
- Niemals im Code

❌ **Falsch:**
- Secrets in Repository committen
- Hardcoded API Keys
- `.env.local` in Git tracken

---

### 7. Zusammenfassung: Top 5 Probleme & Lösungen

#### #1: Leere Seite nach Deployment 🏆
**Häufigkeit:** ⭐⭐⭐⭐⭐  
**Lösung:** `GITHUB_SECRETS_SETUP.md` befolgen

#### #2: Login funktioniert nicht 🔐
**Häufigkeit:** ⭐⭐⭐⭐  
**Lösung:** Firebase Console → Authentication → Email/Password aktivieren

#### #3: Keine Berechtigung zum Erstellen 📝
**Häufigkeit:** ⭐⭐⭐  
**Lösung:** Admin muss Berechtigung auf "edit" setzen

#### #4: Erste Registrierung schlägt fehl ⚠️
**Häufigkeit:** ⭐⭐  
**Lösung:** Firebase Authentication aktivieren und sichere Rules aus [`firestore.rules`](../../firestore.rules) deployen

#### #5: Daten werden nicht geladen 🌐
**Häufigkeit:** ⭐⭐  
**Lösung:** Firestore Rules + Internetverbindung prüfen

---

### 8. Referenzen und weiterführende Links

#### Interne Dokumentation
- [README.md](../../README.md) - Allgemeine Projektübersicht
- [FIREBASE_SETUP.md](../setup/firebase.md) - Firebase-Einrichtung (Deutsch)
- [GITHUB_SECRETS_SETUP.md](../setup/deployment.md) - GitHub Secrets konfigurieren
- [DEPLOYMENT.md](../setup/deployment.md) - Deployment-Details
- [ZUGRIFF_ANLEITUNG.md](../user/zugriff.md) - Benutzer-Anleitung (nicht-technisch)

#### Externe Ressourcen
- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [React Environment Variables](https://create-react-app.dev/docs/adding-custom-environment-variables/)

#### Code-Referenzen
- `src/firebase.js` - Firebase-Initialisierung
- `src/utils/userManagement.js` - Authentifizierung
- `src/utils/recipeFirestore.js` - Rezept-Datenbankoperationen
- `.github/workflows/deploy.yml` - Deployment-Workflow

---

### Anhang A: Debugging-Befehle

#### Lokale Entwicklung
```bash
## Dependencies installieren
npm install

## Entwicklungsserver starten
npm start

## Production Build erstellen
npm run build

## Build lokal testen
npx serve -s build
```

#### Git/GitHub
```bash
## Status prüfen
git status

## Letzte Commits anzeigen
git log --oneline -10

## Deployment-Status (GitHub Actions)
## → Repository → Actions Tab im Browser
```

#### Browser Console
```javascript
// Session-Daten anzeigen
console.log(sessionStorage.getItem('currentUser'));

// Firebase-Status
console.log(firebase.apps.length > 0 ? 'Connected' : 'Not initialized');

// Netzwerk-Test
fetch('https://firestore.googleapis.com/').then(r => console.log('Firebase reachable:', r.ok));
```

---

**Dokument-Version:** 1.0  
**Letztes Update:** 14. Februar 2026  
**Autor:** Technical Analysis - Copilot  
**Status:** ✅ Complete

Bei technischen Fragen zu diesem Dokument: Issue im Repository erstellen
