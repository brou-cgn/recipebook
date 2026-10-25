# Datenschutzerklärung: Abschnitt „Folgen und Netzwerk“ (Entwurf)

Entwurf vom 25.10.2026 für die Datenschutzerklärung der App. Die Erklärung selbst liegt nicht im Repo,
der Abschnitt wird dort eingefügt. **Keine Rechtsberatung:** Rechtsgrundlage, Speicherdauer und
Verantwortlichen bitte vor Veröffentlichung prüfen (Freigabe beim Eigentümer, siehe `follow.md`).

Quelle der technischen Angaben: `follow.md` und `docs/architecture/security.md`, Stand PR 8.

---

## Folgen und Netzwerk

Wenn die Funktion „Folgen“ für dein Konto freigeschaltet ist, kannst du anderen Mitgliedern folgen und
andere Mitglieder können dir folgen.

### Was passiert, wenn dir jemand folgt

Folgen braucht deine Bestätigung. Eine Anfrage wirkt erst, wenn du sie in „Netzwerk“ (unter Chefkoch)
annimmst. Bis dahin sieht die anfragende Person nichts von dir, was sie nicht ohnehin sehen konnte.

Nach dem Annehmen zeigt die App dem Follower in seiner Rubrik „Für dich entdeckt“ Rezepte, die du
zuletzt gekocht oder angelegt hast, **mit deinem Vornamen** („Anna hat das gekocht“) und einer groben
Zeitangabe („gestern“, „diese Woche“). Pro Rezept erscheinen höchstens drei Namen.

Dabei gilt:

- **Rückwirkend:** Es zählen auch frühere Einträge aus dem Zeitfenster, das die Rubrik gerade verwendet
  (derzeit bis zu 30 Tage). Nicht nur Einträge ab dem Annehmen.
- **Einträge aus dem Kochtagebuch:** Verwendet werden deine „Gekocht am“-Einträge und die Rezepte, die
  du angelegt hast. Du kannst einzelne Einträge nicht ausnehmen.
- **Ernährungsbezug:** Aus den Einträgen lässt sich ablesen, was du gekocht hast. Das kann Rückschlüsse
  auf Ernährungsgewohnheiten zulassen. Nimm eine Anfrage nur an, wenn du das für die Person in Ordnung findest.

### Was die App speichert

- Eine Verbindung „Person A folgt Person B“ mit Status (angefragt oder angenommen) und den Zeitpunkten
  der Anfrage und der Antwort.
- Für den Follower eine private Zwischenablage mit den Rezepten, deren Namen und dem Tag, der in „Für dich
  entdeckt“ gezeigt wird. Nur der Follower selbst kann sie lesen, nur die App schreibt sie.
- Wenn du eine Anfrage ablehnst oder blockierst: eine Sperre, damit dieselbe Person nicht sofort erneut
  anfragen kann (30 Tage nach Ablehnung, dauerhaft nach Blockieren).
- Pro Absender zählt die App Anfragen (höchstens 20 pro Tag), um Missbrauch zu verhindern.

Die anfragende Person erfährt nicht, dass du abgelehnt oder blockiert hast. Für sie bleibt die Anfrage
„angefragt“.

### Benachrichtigung

Wenn du die Hintergrundaktualisierung eingeschaltet hast, erhältst du bei einer neuen Anfrage eine
Push-Mitteilung mit dem Vornamen der anfragenden Person. Ohne Hintergrundaktualisierung siehst du die
Anfrage nur in der App (Badge am Tab „Chefkoch“).

### Deine Möglichkeiten

- Anfragen annehmen, ablehnen oder die Person blockieren, ein Blockieren kannst du in „Netzwerk“ wieder aufheben.
- Follower jederzeit entfernen. Danach erscheinen deine Einträge dieser Person nicht mehr.
- Selbst jemandem folgen und das Folgen beenden oder eine offene Anfrage zurückziehen, in „Netzwerk“ oder
  auf dem Profil der Person.
- Die Funktion ist freiwillig. Ohne Annehmen einer Anfrage ändert sich nichts.

### Wichtig: Was das Bestätigen nicht schützt

Die Bestätigung steuert nur, **wer deine Aktivität aktiv und mit Namen vorgeschlagen bekommt**. Sie ist
kein technischer Zugriffsschutz: Rezepte und Kochtagebuch-Einträge sind für angemeldete Mitglieder der
App im Rahmen der Sichtbarkeit des jeweiligen Rezepts auch ohne Folgen einsehbar. Die Sichtbarkeit eines
Rezepts (privat, Liste, öffentlich) bleibt unverändert und gilt auch für „Für dich entdeckt“.

### Wenn ein Konto gelöscht wird

Mit dem Konto werden auch seine Follow-Verbindungen, offenen Anfragen, Sperren, die private
Zwischenablage für „Für dich entdeckt“ und seine Kochtagebuch-Einträge („Gekocht am“) gelöscht.
Danach wird nichts mehr von diesem Mitglied vorgeschlagen. Ebenso werden seine nicht öffentlichen Rezepte
(Entwürfe und Rezepte, die nur in einer privaten Liste liegen) mit ihren Bildern, Bewertungen und den
Kochtagebuch-Einträgen darauf gelöscht. Öffentliche Rezepte bleiben bestehen und tragen weiter den Namen
des Autors; für sie gelten die allgemeinen Regeln dieser Erklärung zur Löschung von Konten.

### Rechtsgrundlage

Das Annehmen einer Anfrage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO) in die namentliche
Anzeige deiner Aktivität für diese Person. Du kannst sie jederzeit mit Wirkung für die Zukunft widerrufen,
indem du den Follower entfernst. Bereits angezeigte Hinweise lassen sich dadurch nicht zurückholen.

---

## Offene Punkte für die Prüfung

1. **Verantwortlicher, Kontakt, Aufsichtsbehörde:** Stehen schon in der bestehenden Erklärung, hier nicht doppelt.
2. **Speicherdauer / Konto-Löschung:** Gelöst am 25.10.2026 (`functions/followCleanup.js`, aufgerufen vom Trigger
   `syncPublicProfile` beim Löschen von `users/{id}`). Gelöscht werden `follows` beider Richtungen,
   die zugehörigen `followCooldowns`, `followLimits` des Mitglieds, `followInbox`, `followBlocks` und
   `fuerDichEntdeckt/current` sowie die Gegenstücke in fremden Postfächern. Grenzen: Rezepte und
   `cookDates` des Mitglieds und seine nicht öffentlichen Rezepte werden seit PR 10 ebenfalls gelöscht (`functions/accountCleanup.js`). Öffentliche Rezepte bleiben mit Autorennamen bestehen, ebenso Verweise anderer Nutzer auf gelöschte Rezepte (Menüs, Favoriten, Events, Versionen). Eine Sperrfrist ohne `follows`-Dokument
   (Anfragender hat zurückgezogen) läuft nach höchstens 30 Tagen ab. Konten löscht nur ein Admin, eine
   Selbstlöschung gibt es nicht. Der Text im Abschnitt darf deshalb zusagen, dass die Follow-Verbindungen
   mit dem Konto verschwinden, nicht aber, dass alle Daten des Kontos gelöscht werden.
3. **Einwilligung:** Der Hinweistext in der Anfragen-Liste entfällt (Entscheidung 25.10.2026). Die
   Einwilligung stützt sich damit allein auf diese Erklärung, ohne dass die Person sie beim Annehmen
   sieht. Ob das als informierte Einwilligung reicht, ist eine Rechtsfrage. Mindestens ein Link auf
   diesen Abschnitt neben „Annehmen“ würde den Text sichtbar machen.
4. **Rückwirkung und Zeitfenster:** „derzeit bis zu 30 Tage“ steht so im Text, die Admin-Einstellung des
   Themas kann abweichen. Bei Änderung des Zeitfensters den Text nachziehen.
5. **Gäste:** Anonyme Gäste können Follow nicht nutzen (`canUseFollow` schließt sie aus). Der Text
   erwähnt sie deshalb nicht.
