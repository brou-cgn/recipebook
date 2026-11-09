# Wichteln

Wichtel-Runden für Feiern: Teilnehmer eintragen, auslosen, jeder bekommt einen
persönlichen Link. Über den Link zieht er sein Los, sieht die Wünsche seines
Wichtelpartners und kann Geschenkideen für andere Gäste hinterlassen.

## Ablauf

**Organisator** (Events > „Wichteln“, mobil der Geschenk-Button unten links; ab Rolle `edit`):

1. Runde anlegen: Titel, optional Anlass (Weihnachten, Nikolaus, Silvester, Ostern, Geburtstag, Hochzeit, Jubiläum, Firmenfeier, Sommerfest, Abschied, Einweihung, Sonstiges), Budget und Hinweis (z. B. „Bescherung am 13.12.“).
2. Teilnehmer eintragen – mehrere auf einmal mit Komma, oder per Tipp aus der eigenen Gästeliste.
   Namen sind je Runde eindeutig (Groß-/Kleinschreibung egal). Ein Gast aus der Gästeliste (per Tipp
   oder mit genau seinem Namen eingetippt) wird mit dem Teilnehmer verknüpft und ist je Runde nur
   einmal dabei, auch nach dem Umbenennen.
3. Optional Ausschlüsse (ab drei Teilnehmern): in der Zeile eines Teilnehmers „Ausschlüsse“ öffnen
   und antippen, wen er nicht ziehen soll. Jeder Tipp speichert sofort. Ein Ausschluss gilt nur in
   eine Richtung – bei Paaren für beide setzen. Einen Gast muss jeder beschenken können, der letzte
   freie lässt sich nicht ausschließen. Zugeklappt steht in der Zeile „Beschenkt nicht: …“.
4. Links verschicken. Verknüpfte Gäste mit E-Mail-Adresse bekommen ihren Link beim Eintragen
   automatisch per Mail, in der Sprache aus ihrem Gästeprofil (siehe „Einladung per Mail“). Für alle
   anderen „Link teilen“: Teilen-Menü des Handys, sonst Kopieren – der Text ist ebenfalls in der
   Sprache des Gasts, ohne verknüpften Gast Deutsch. Das geht schon vor dem Auslosen – dann können
   alle früh ihre Wünsche eintragen.
5. „Jetzt auslosen“ (ab drei Teilnehmern). Lassen die Ausschlüsse keine Auslosung zu, sagt die App,
   woran es liegt (z. B. „Für „Anna“ sind alle anderen ausgeschlossen“). Danach sind Teilnehmer und
   Ausschlüsse gesperrt; ändern geht erst nach „Auslosung zurücksetzen“ (mit Rückfrage). Links,
   Ausschlüsse, Wünsche und Ideen bleiben dabei erhalten, wer schon gezogen hatte, zieht nach dem
   nächsten Auslosen neu.
6. Je Teilnehmer sichtbar: „Link noch nicht geöffnet“ / „Link geöffnet“ / „Los gezogen“, bei Mails
   zusätzlich „Per Mail verschickt“ oder „Mail nicht verschickt“. „Per Mail senden“ bzw. „Erneut
   senden“ steht bei jedem Teilnehmer, dessen Gast eine E-Mail-Adresse hat, auch nach dem Auslosen.

**Teilnehmer** (`/wichteln/{rundeId}/{token}`, ohne Login):

- „Los ziehen“: der Zettel klappt auf und zeigt, wen man beschenkt (ohne Animation bei
  „Bewegung reduzieren“).
- Danach: Wünsche des Gezogenen und Ideen anderer Gäste für ihn (mit Absender).
- „Deine Wünsche“: sieht nur, wer einen gezogen hat.
- „Geschenkideen für andere“: Gast wählen, Idee speichern. Sieht nur, wer diesen Gast gezogen hat –
  mit dem eigenen Namen, die Person selbst nie.
- Zu Wunsch und Idee optional ein Link (z. B. zum Shop); Text oder Link genügt. Der Eintrag zeigt dann
  eine Vorschau mit Bild, Seitentitel und Seite (siehe „Link-Vorschau“). Ein ins Textfeld eingefügter
  Link am Ende („Produktname https://…“, wie aus dem Teilen-Menü einer Shop-App) wird zum Link.
- Eigene Einträge löschen: sofort mit „Rückgängig“ (6 s), mobil per Linksswipe.
- Sprache: Deutsch, Englisch oder Französisch – nach der Sprachpräferenz im Gästeprofil, mit dem der
  Teilnehmer verknüpft ist (Profile ohne Wahl: Deutsch). Ohne verknüpftes Profil, beim Laden und bei
  einem ungültigen Link gilt die Browsersprache, wenn sie eine der drei ist, sonst Deutsch. Titel, Budget,
  Hinweis, Namen und Einträge erscheinen so, wie sie eingegeben wurden.

## Wer sieht was

| Daten | Teilnehmer selbst | Wer ihn gezogen hat | Andere Teilnehmer | Organisator |
|---|---|---|---|---|
| Wen er gezogen hat | ja, nach „Los ziehen“ | – | nein | **nein** |
| Seine Wünsche | ja | ja | nein | nein |
| Ideen anderer über ihn | **nein** | ja (mit Absender) | nur der Absender seine eigene | nein |
| Namen aller Teilnehmer | ja | ja | ja | ja |
| Persönlicher Link (Token) | ja | nein | nein | ja (zum Verschicken) |
| Seine Ausschlüsse (wen er nicht ziehen soll) | nein | nein | nein | ja (legt sie fest) |
| E-Mail-Adresse und Sprache | nein | nein | nein | ja, in der eigenen Gästeliste (nicht in der Runde gespeichert) |
| Verknüpfter Gast, Mail-Status | nein | nein | nein | ja |

Durchgesetzt wird das serverseitig, nicht in der Oberfläche:

- `firestore.rules`: `wichtelRunden` samt Unter-Collections ist für **jeden** Client gesperrt,
  auch für Organisator und Admins (Regeltest `rules-tests/wichteln.test.js`).
- Alle Zugriffe laufen über zwei Callables in `functions/wichteln.js`
  (Tests: `functions/wichteln.test.js`, u. a. „Wünsche und Ideen sieht nur, wer den Gast gezogen hat“).

Bewusste Grenzen: Der Organisator kennt alle Links und könnte einen fremden Link öffnen. Das liegt
am Verfahren „Organisator verschickt die Links“; die App zeigt ihm die Zuordnung nie. Ebenso kann
er mit Ausschlüssen die Auslosung so weit einengen, dass nur noch ein Kreis übrig bleibt – dann
kennt er die Zuordnung, ohne dass die App sie zeigt. Ausschlüsse sind ein Werkzeug des Organisators,
kein Schutz gegen ihn.

## Datenmodell

```
wichtelRunden/{rundeId}            ownerId, titel, anlass (Schlüssel oder ''), budget, hinweis, status ('offen'|'ausgelost'),
                                   teilnehmerAnzahl, ausgelostAm, erstelltAm, aktualisiertAm
  teilnehmer/{teilnehmerId}        name, token (geheim), reihenfolge, ausschluesse (Teilnehmer-IDs,
                                   die er nicht ziehen soll; fehlt bei älteren = keine), geoeffnetAm,
                                   gezogenAm, erstelltAm, gastId (→ guests/{ownerId}/profiles/{gastId}
                                   oder null), mailStatus ('gesendet'|'fehler'|null), mailAm (letzter
                                   Versuch)
  zuordnungen/{geberId}            empfaengerId, ausgelostAm
  eintraege/{eintragId}            autorId, ueberId, text, erstelltAm,
                                   url und vorschau {bild, titel, seite} (nur mit Link; vorschau null,
                                   wenn der Abruf scheiterte)

wichtelMailLimits/{uid}_{JJJJ-MM-TT}   uid, tag, anzahl   (Tageszähler je Organisator, Berliner Tag)
```

Teilnehmer, die vor der Gast-Verknüpfung angelegt wurden, haben die drei Mail-Felder nicht; das liest
sich wie `null`. Die Oberfläche ordnet sie über den gleichen Namen einem Gast zu (Sprache beim Teilen,
„Per Mail senden“); beim ersten Senden wird die Verknüpfung gespeichert.

Ein Wunsch ist ein Eintrag mit `autorId == ueberId`, eine Geschenkidee einer mit `autorId != ueberId`.
Teilnehmer-IDs sind keine Geheimnisse (sie stehen in der Gästeliste jedes Teilnehmers), das Token schon.

## Schnittstellen

`wichtelVerwalten` (angemeldet, nicht anonym, Rolle `edit`/`moderator`/`admin`, nur eigene Runden),
Feld `aktion`: `liste`, `laden`, `anlegen`, `aendern`, `teilnehmerHinzufuegen`, `teilnehmerUmbenennen`,
`teilnehmerEntfernen` (löscht auch seine Einträge und die Ideen über ihn und nimmt ihn aus den
Ausschlüssen der anderen), `ausschluesseSetzen` (`teilnehmerId`, `ausschluesse`: ersetzt die Liste, nur
vor dem Auslosen; unbekannte IDs und der Teilnehmer selbst fallen still heraus), `auslosen`,
`zuruecksetzen`, `loeschen`, `einladungSenden` (`teilnehmerId`, optional `gastId` zum Verknüpfen).
Fremde Runden antworten wie nicht vorhandene (`not-found`). Die Organisator-Sicht enthält je
Teilnehmer `ausschluesse`, `gastId` und `mail`; Teilnehmer-Antworten enthalten nichts davon.

Bei `anlegen` und `teilnehmerHinzufuegen` ist jeder Eintrag in `namen` ein Name oder
`{name, gastId}`. Diese beiden und `einladungSenden` antworten zusätzlich mit
`versand: {gesendet, fehlgeschlagen, grund}`; `grund` ist `nicht-eingerichtet` (SMTP-Secrets fehlen),
`limit` (Tageslimit) oder `fehler` (Mailserver, Limit nicht prüfbar).

`wichtelTeilnahme` (ohne Login; `rundeId` + `token`), Feld `aktion`: `laden` (setzt „Link geöffnet“),
`ziehen`, `eintragHinzufuegen` (`ueberId`, `text` ≤ 300 Zeichen und/oder `url` ≤ 2000 Zeichen, höchstens
50 Einträge je Teilnehmer; ohne `https://` wird es ergänzt, andere Schemata sind ungültig),
`eintragLoeschen` (nur eigene). Einträge gehen mit `url` und `vorschau` (je `null` ohne Link) heraus. Falsches Format, unbekannte Runde und falsches Token geben dieselbe
Antwort (`not-found`).
Jede Antwort enthält `ich.sprache`: den Code aus dem verknüpften Gästeprofil
(`guests/{ownerId}/profiles/{gastId}`, Feld `sprache`; ohne Feld `de`), sonst `null`. Gelesen wird nur
unter den Profilen des Organisators der Runde, und vom Profil verlässt nur dieser Code den Server. Die
Fehlermeldungen des Servers sind deutsch; die Teilnehmerseite übersetzt nach Fehlercode.

Client: `src/utils/wichtelFirestore.js`, Links und Teilen-Text: `src/utils/wichtelLinks.js`,
Oberflächen: `src/components/WichtelPage.js` (Organisator), `src/components/WichtelTeilnahmePage.js`
(Texte auf Deutsch, Englisch, Französisch und Wahl der Sprache: `src/utils/wichtelTeilnahmeTexte.js`).

## Einladung per Mail

- **Wann:** beim Eintragen eines Teilnehmers, der mit einem Gast mit E-Mail-Adresse verknüpft ist, und
  auf „Per Mail senden“ / „Erneut senden“. Beim Auslosen geht keine Mail raus; der Link bleibt derselbe.
- **Sprache:** Feld `sprache` im Gästeprofil (`de`, `en`, `fr`), auswählbar unter Gäste verwalten.
  Profile ohne das Feld – alle, die vor der Sprachwahl angelegt wurden – gelten als Deutsch; ein
  Speichern ohne Feld (ältere App-Version) überschreibt eine gesetzte Sprache nicht. Die Liste steht in
  `functions/shared/sprachen.js` und `src/utils/guestPreferences.js`, ein Test hält beide gleich.
- **Inhalt** (`functions/wichtelMail.js`, Text und HTML): Anrede mit dem Teilnehmernamen, Vorname des
  Organisators, Titel, Budget und Hinweis (so, wie der Organisator sie schrieb, nicht übersetzt), der
  persönliche Link (`https://broubook.web.app/wichteln/…`) und „Bitte nicht weitergeben“. Eingaben stehen
  im HTML nur escaped.
- **Empfänger:** nur Adressen aus der Gästeliste des Organisators. Adresse und Sprache liest die Function
  bei jedem Versand frisch aus dem Gästeprofil; in der Runde stehen nur `gastId` und das Ergebnis.
- **Grenzen:** höchstens 150 Mails je Organisator und Berliner Tag (`wichtelMailLimits`, jeder Versuch
  zählt; ist der Zähler nicht prüfbar, geht keine Mail raus). Logs nennen nur Teilnehmer- und
  Runden-IDs und Fehlercodes des Mailservers, nie die Adresse (Tech-Check S26).
- **Versand:** SMTP-Secrets `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` (dieselben
  wie für die Listen-Einladung), nodemailer mit kleinem Pool, Function-Timeout 120 s.

## Link-Vorschau

Beim Speichern eines Eintrags mit Link ruft der Server die Seite **einmal** ab (`functions/linkVorschau.js`,
Tests: `functions/linkVorschau.test.js`) und legt Bild-Adresse, Titel und Seitennamen mit dem Eintrag ab.
Das Speichern wartet darauf (bis zu 5 s); scheitert der Abruf, wird ohne Vorschau gespeichert und die
Seite zeigt ein Link-Symbol mit dem Seitennamen. Ein neuer Versuch geht nur über Löschen und neu Anlegen.

- Bild: `og:image`, sonst `twitter:image`, `image_src`, Microdata, JSON-LD, Amazon-Produktbild
  (`#landingImage`, Amazon hat kein `og:image`). Ein direkter Bild-Link ist selbst das Bild.
- Titel: `og:title`, sonst `<title>`. Bot-Abwehrseiten („Just a moment…“, „Access Denied“ u. a.)
  liefern keine Vorschau statt eines falschen Titels.
- Das Bild lädt der Browser des Betrachters direkt von der Seite des Shops, ohne Referrer: Die Adresse
  der Teilnehmerseite enthält das geheime Token.
- Schutz, weil der Abruf ohne Login erreichbar ist: nur GET auf http/https mit Standard-Port, nur
  öffentliche IP-Adressen (geprüft beim Verbindungsaufbau, also auch nach Weiterleitungen und gegen
  DNS-Rebinding), höchstens 5 Weiterleitungen, 5 s, 2 MB HTML.

Grenzen: Große Shops (vor allem Amazon) blocken Abrufe aus Rechenzentren oft mit einer Captcha-Seite –
dann gibt es keine Vorschau. Aus der Entwicklungsumgebung ließ sich das nicht prüfen; getestet mit lokalem
Server und echten Seiten (pypi.org, jsr.io).

## Auslosung

Ein einziger Kreis: Fisher-Yates mit kryptografischem Zufall (`crypto.randomInt`), danach beschenkt jeder
seinen Nachfolger. So zieht niemand sich selbst, und ab drei Teilnehmern beschenken sich nie zwei
gegenseitig. Ohne Ausschlüsse ist jeder mögliche Kreis gleich wahrscheinlich.

Mit Ausschlüssen (`zieheKreis` in `functions/wichteln.js`):

1. **Engpass-Prüfung:** Darf jemand niemanden mehr ziehen oder niemand mehr ihn, gibt es keinen Kreis.
   `auslosen` lehnt dann sofort ab und nennt die Person.
2. **Ziehen und Verwerfen:** Verletzt ein gezogener Kreis einen Ausschluss, wird neu gezogen (bis zu
   2000-mal, bei 100 Teilnehmern rund 40 ms). Jeder erlaubte Kreis bleibt damit gleich wahrscheinlich;
   bei üblichen Ausschlüssen (Paare, einzelne Wünsche) passt nach wenigen Versuchen einer.
3. **Gezielte Suche** nur, wenn das nichts findet – etwa „nicht im eigenen Team“, wenn ein Team die
   Hälfte stellt: Die Reihe wird Schritt für Schritt verlängert, wer die wenigsten Möglichkeiten hat,
   kommt zuerst dran, und ein Zweig endet, sobald ein noch Freier keinen möglichen Empfänger oder Geber
   mehr hat. Das Ergebnis ist zufällig, aber nicht mehr exakt gleichverteilt. Nach 20 000 Schritten gibt
   die Suche auf (unlösbar mit 100 Teilnehmern: rund 0,2 s); `auslosen` meldet dann
   `failed-precondition` („Mit diesen Ausschlüssen ließ sich keine Auslosung finden“).

Tests: `functions/wichteln.test.js` (u. a. Abgleich der Suche mit allen Reihenfolgen bis sieben
Teilnehmer, Gleichverteilung über die erlaubten Kreise, Team-Fall).

Das Token hat 192 Bit (24 Zufallsbytes, base64url).

## Offen / mögliche Erweiterungen

- Ausschluss für beide Richtungen auf einmal (Paare mit einem Tipp) – heute je Richtung einzeln.
- Ändert der Organisator in einer zweiten Sitzung im selben Moment Teilnehmer oder Ausschlüsse, in dem
  ausgelost wird, kann die Änderung die Auslosung überholen (Statusprüfung und Schreiben nicht in einer
  Transaktion; Tech-Check F19). Behebbar mit „Auslosung zurücksetzen“ und neu auslosen.
- Link erneuern, falls ein Link an die falsche Person ging (heute: Teilnehmer entfernen und neu anlegen,
  nur vor dem Auslosen).
- Runden werden nicht automatisch gelöscht; der Organisator löscht sie in der Übersicht.
- Link-Vorschau schon im Formular zeigen (vor dem Speichern) und eine gescheiterte Vorschau später neu holen.
- Vorschaubilder selbst speichern statt vom Shop zu laden (unabhängig von Shop-Änderungen, kein Abruf
  des Betrachters beim Shop) – braucht einen Storage-Ordner samt Regeln und Aufräumen.
- Die Teilnehmerseite (`/wichteln/…`) ist nur deutsch: Ein Gast mit Sprache Englisch oder Französisch
  bekommt Mail und Teilen-Text in seiner Sprache, die Seite hinter dem Link aber auf Deutsch.
- Keine Benachrichtigung beim Auslosen („Jetzt kannst du dein Los ziehen“) – wer früh eingeladen
  wurde, muss selbst wieder vorbeischauen oder vom Organisator erinnert werden („Erneut senden“).
