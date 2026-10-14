# Saisonmatrix für Rezepte – Fachliches & technisches Konzept (MVP)

## 1) Grundidee

Die Saisonmatrix ist eine **zentrale, administrierbare Stammdatenbasis** für saisonale Eigenschaften von Zutaten.  
Rezepte werden **nicht** manuell als „saisonal“ getaggt, sondern erhalten ihre saisonale Bewertung dynamisch über die enthaltenen Zutaten.

### Zielbild
- **Konsistenz**: saisonale Logik an einer Stelle pflegen, statt in jedem Rezept.
- **Wartbarkeit**: Änderungen (z. B. regionale oder klimatische Verschiebungen) ohne Rezeptmigration.
- **Transparenz**: nachvollziehbare Kriterien je Zutat und Region.

### Grenzen
- Saison ist nie absolut: regionale Unterschiede, Wetter, Angebot/Import und persönliche Präferenzen bleiben Einflussfaktoren.

---

## 2) Datenmodell der Saisonmatrix (pro Zutat)

| Feld | Typ | Pflicht (MVP) | Beschreibung |
|---|---|---:|---|
| `id` | string | ✅ | Eindeutige, stabile Zutat-ID (z. B. `kartoffel`) |
| `name` | string | ✅ | Anzeigename |
| `category` | string | optional | Oberkategorie (Gemüse, Obst, Kräuter …) |
| `mainSeasonMonths` | number[] (1-12) | ✅ | Hauptsaison-Monate |
| `secondarySeasonMonths` | number[] | optional | Nebensaison-Monate |
| `seasonScore` | number (0-100) | ✅ | Saisonale Stärke je Zutat |
| `isActive` | boolean | ✅ | Aktiv/Inaktiv |
| `region` | string | ✅ (einfach) | Regionale Ausprägung (MVP: z. B. `DE`, `AT`, `CH` oder `GLOBAL`) |
| `synonyms` | string[] | optional | Synonyme/Schreibweisen |
| `description` | string | optional | Begründung/Hinweistext |
| `updatedAt` | timestamp | ✅ | Letzte Änderung |
| `updatedBy` | string | optional | Bearbeitender User (für Nachvollziehbarkeit) |
| `currentSeasonStatus` | string | berechnet | Tagesaktueller Saisonstatus: `Hauptsaison`, `Nebensaison`, `Bald_Saison` oder `Keine_Saison` |

### Technische Ablage (Vorschlag)
- Firestore-Collection: `seasonMatrix`
- Dokument-ID = `id`
- Nur Admins/Moderatoren dürfen schreiben; Lesezugriff für App-Clients.

---

## 3) Saisonale Relevanzlogik für Rezepte

### 3.1 Eingangsdaten
- Rezeptzutaten (normalisiert auf Zutat-IDs, inkl. optionaler Gewichte/Mengenfaktor).
- Aktueller Monat + Region.
- Aktive Saisonmatrix-Einträge.

### 3.2 Berechnung (MVP)
1. Für jede Rezeptzutat passenden Matrixeintrag finden (ID/Synonym-Match).
2. `ingredientScore` je Zutat bestimmen:
   - Monat in `mainSeasonMonths` → `seasonScore`
   - Monat in `secondarySeasonMonths` → `seasonScore * 0.6` (konfigurierbarer Dämpfungsfaktor)
   - sonst → `seasonScore * 0.2` (außerhalb Saison)
3. Aggregation:
   - Standard: gewichteter Durchschnitt  
     `recipeSeasonScore = Σ(ingredientScore * weight) / Σ(weight)`
   - Falls kein Gewicht verfügbar: `weight = 1`
4. Optionaler Dominanzschutz:
   - Nur Top-X gewichtete Zutaten in Berechnung (späterer Ausbau), um Randzutaten zu entwerten.

### 3.3 Dynamische Rezept-Labels
- **Frisch & saisonal**: `score > 80`
- **Teilweise saisonal**: `score > 50`
- **Gering saisonal**: `score <= 50`

Zusatztext im UI:
- „Gericht enthält X Zutaten in Hauptsaison“
- „Teilweise saisonal nach Matrix“

---

## 4) UX- und Produktlogik

- Saisonstatus als **Badge in Rezeptlisten und Detailansicht** (nicht dominant).
- Fokus auf Motivation statt Bewertungston: „Jetzt besonders lecker“.
- Tooltip/Detailansicht: erklärt Score + saisonale Zutatenanteile.
- Kombinierbar mit bestehenden Badges/Filtern, ohne Informationsüberladung.

---

## 5) Admin-Oberfläche (Matrix-Management)

### Tabellenansicht (MVP)
Spalten:
- ID, Name, Kategorie, Hauptsaison, Score, Aktiv, Region, letzte Änderung

Funktionen:
- Suche/Filter nach Name, Kategorie, aktiver Saison, Region, Status
- Inline-Editing für schnelle Anpassungen
- Detail-Editor für optionale Felder
- Import/Export (CSV/JSON) für Massenpflege

### Umgesetzte Berechtigungen
- Die Saisonmatrix ist im Adminbereich als eigener Tab in den Einstellungen verfügbar.
- Sichtbarkeit und Bearbeitung im Frontend sind auf **Moderatoren** und **Administratoren** beschränkt.
- Firestore erlaubt für `seasonMatrix` Leserechte für authentifizierte App-Nutzer, aber **CRUD nur für Moderatoren/Administratoren**.
- Die UI blendet für andere Rollen die Saisonmatrix aus und zeigt beim direkten Aufruf keinen Bearbeitungszugang an.

### Änderungsverfolgung
- MVP: `updatedAt`, `updatedBy`
- Später: echte Versionierung/Audit-Log pro Änderung

---

## 6) MVP-Scope vs. später

### MVP (jetzt)
- ID, Name, Hauptsaison, Score, Aktiv/Inaktiv
- Einfache Region
- Admin-Grundansicht mit Bearbeitung
- Basis-API/Funktion zur Rezept-Score-Berechnung

### Später
- Synonyme, Nebensaison-Feinheiten
- Detaillierte Regionslogik (z. B. Bundesländer)
- Vollständige Versionierung
- Erweiterte Erklärtexte und Transparenz-UI

---

## 7) Risiken & Leitplanken

- Qualität der Saison-Bewertung hängt direkt von Matrix-Pflege ab.
- Importware/Ganzjahresverfügbarkeit kann den Saisonbegriff verwässern.
- Zu strenge Saisonfokussierung kann relevante Rezepte „verstecken“.
- Gefahr von Pseudo-Präzision: Score bleibt ein Entscheidungshelfer, kein Naturgesetz.

**Leitplanke:** Modell einfach starten, Nutzungsfeedback einholen, iterativ verfeinern.
