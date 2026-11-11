# Wichteln

Wichtel-Runden für Feiern: Teilnehmer eintragen, auslosen, jeder bekommt einen
persönlichen Link. Über den Link zieht er sein Los, sieht die Wünsche seines
Wichtelpartners und kann Geschenkideen für andere Gäste hinterlassen.

## Ablauf

**Organisator** (Events > „Wichteln“, mobil der Geschenk-Button unten links, oder direkt
`broubook.web.app/wichteln`, siehe „Direktlink für Organisatoren“; ab Rolle `edit`):

1. Runde anlegen: Titel, optional Anlass (Weihnachten, Nikolaus, Silvester, Ostern, Geburtstag, Hochzeit, Jubiläum, Firmenfeier, Sommerfest, Abschied, Einweihung, Sonstiges), Datum der Feier, Budget und Hinweis (z. B. „Bescherung nach dem Essen“).
   Alle fünf lassen sich jederzeit ändern („Runde bearbeiten“), auch nach dem Auslosen – etwa ein Datum
   nachtragen. Das Datum steht in der Runde, in der Übersicht, auf der Teilnehmerseite und in den Mails; es
   begrenzt die Mails (siehe „Erinnerung per Mail“ und „Neuigkeiten per Mail“).
2. Teilnehmer eintragen: Vorname, Nachname und optional die E-Mail-Adresse, je Teilnehmer ein Eintrag.
   Wer noch nicht in der eigenen Gästeliste steht, wird dort im selben Schritt als Gast angelegt
   (siehe „Neue Gäste aus der Runde“). Beim Tippen in Vor- oder Nachname erscheinen passende Gäste aus
   der Gästeliste als Pillen; ein Tipp trägt den Gast ein. Ein eingetippter Name, der genau einem Gast
   entspricht, verknüpft diesen, statt ein zweites Profil anzulegen. Namen sind je Runde eindeutig
   (Groß-/Kleinschreibung egal). Ein verknüpfter Gast ist je Runde nur einmal dabei, auch nach dem
   Umbenennen.
3. Optional Ausschlüsse (ab drei Teilnehmern): in der Zeile eines Teilnehmers „Ausschlüsse“ öffnen
   und antippen, wen er nicht ziehen soll. Jeder Tipp speichert sofort. Ein Ausschluss gilt nur in
   eine Richtung – bei Paaren für beide setzen. Einen Gast muss jeder beschenken können, der letzte
   freie lässt sich nicht ausschließen. Zugeklappt steht in der Zeile „Beschenkt nicht: …“.
4. Vor dem Auslosen geht keine Mail raus, auch nicht von Hand. Teilnehmer, deren Gast eine
   E-Mail-Adresse hat, zeigen „Mail beim Auslosen“. Gästen ohne Adresse schickt der Organisator den Link
   selbst: „Link teilen“ öffnet das Teilen-Menü des Handys, sonst wird kopiert – der Text ist in der
   Sprache des Gasts, ohne verknüpften Gast Deutsch. Das geht schon vor dem Auslosen – dann können sie
   früh ihre Wünsche eintragen.
5. „Jetzt auslosen“ (ab drei Teilnehmern). Lassen die Ausschlüsse keine Auslosung zu, sagt die App,
   woran es liegt (z. B. „Für „Anna“ sind alle anderen ausgeschlossen“). Mit dem Auslosen bekommt jeder
   Teilnehmer, dessen Gast eine E-Mail-Adresse hat, seinen Link per Mail, in der Sprache aus seinem
   Gästeprofil (siehe „Einladung per Mail“); wer danach noch keinen Wunsch eingetragen hat, wird per
   Mail erinnert (siehe „Erinnerung per Mail“). Danach sind Teilnehmer und Ausschlüsse gesperrt;
   ändern geht erst nach „Auslosung zurücksetzen“ (mit Rückfrage). Links, Ausschlüsse, Wünsche und
   Ideen bleiben dabei erhalten, wer schon gezogen hatte, zieht nach dem nächsten Auslosen neu.
6. Je Teilnehmer sichtbar: „Link noch nicht geöffnet“ / „Link geöffnet“ / „Los gezogen“ / „Geschenk gekauft“
   (der Teilnehmer setzt das selbst auf seiner Linkseite; der Organisator sieht nie, für wen), bei Mails
   zusätzlich „Per Mail verschickt“ oder „Mail nicht verschickt“. „Per Mail senden“ bzw. „Erneut
   senden“ steht nach dem Auslosen bei jedem Teilnehmer, dessen Gast eine E-Mail-Adresse hat.

**Teilnehmer** (`/wichteln/{rundeId}/{token}`, ohne Login):

- „Los ziehen“: der Zettel klappt auf und zeigt, wen man beschenkt (ohne Animation bei
  „Bewegung reduzieren“).
- Danach: Wünsche des Gezogenen und Ideen anderer Gäste für ihn (mit Absender).
- „Deine Wünsche“: sieht nur, wer einen gezogen hat.
- „Geschenkideen für andere“: Gast wählen, Idee speichern. Sieht nur, wer diesen Gast gezogen hat –
  mit dem eigenen Namen, die Person selbst nie.
- „Ich habe das Geschenk gekauft“: Schalter in der Karte des Gezogenen, nur nach dem Ziehen; lässt sich
  zurücknehmen. Auslosung zurücksetzen und neu auslosen löscht den Status.
- Neuigkeiten per Mail: Wer sein Los gezogen hat und mit einem Gast mit E-Mail-Adresse verknüpft ist,
  bekommt eine Mail, sobald sein Empfänger Wünsche oder andere Gäste Ideen für ihn eintragen – bis er
  „Geschenk gekauft“ setzt (siehe „Neuigkeiten per Mail“). Der Button „Geschenk gekauft“ in der Mail
  öffnet die Linkseite mit einer Rückfrage ganz oben; erst „Ja, Geschenk gekauft“ setzt den Status.
- Erinnerung per Mail: Wer seine Einladung per Mail bekommen und noch keinen Wunsch eingetragen hat,
  wird erinnert – drei Tage nach der Einladung, danach wöchentlich, höchstens dreimal, mit Datum der Feier
  spätestens drei Tage davor. Der erste eigene Wunsch beendet die Erinnerungen (siehe „Erinnerung per Mail“).
- Zu Wunsch und Idee optional ein Link (z. B. zum Shop); Text oder Link genügt. Der Eintrag zeigt dann
  eine Vorschau mit Bild, Seitentitel und Seite (siehe „Link-Vorschau“). Ein ins Textfeld eingefügter
  Link am Ende („Produktname https://…“, wie aus dem Teilen-Menü einer Shop-App) wird zum Link.
- Eigene Einträge löschen: sofort mit „Rückgängig“ (6 s), mobil per Linksswipe.
- Sprache: Deutsch, Englisch oder Französisch – nach der Sprachpräferenz im Gästeprofil, mit dem der
  Teilnehmer verknüpft ist (Profile ohne Wahl: Deutsch). Ohne verknüpftes Profil, beim Laden und bei
  einem ungültigen Link gilt die Browsersprache, wenn sie eine der drei ist, sonst Deutsch. Titel, Budget,
  Hinweis, Namen und Einträge erscheinen so, wie sie eingegeben wurden; das Datum der Feier ausgeschrieben in
  der Sprache der Seite („Sonntag, 13. Dezember 2026“).

## Direktlink für Organisatoren

`broubook.web.app/wichteln` öffnet die Wichtel-Seite (Übersicht der eigenen Runden mit „+ Runde“) ohne
den Weg über Events. Groß-/Kleinschreibung und ein Schrägstrich am Ende sind egal.

- Nicht angemeldet: Zuerst kommt die Anmeldung (ohne Hinweis-Banner), danach geht es direkt zu Events > Wichteln. Bis dahin bleibt `/wichteln`
  in der Adresse, ein Neuladen der Anmeldeseite verliert den Link also nicht.
- Mit dem Öffnen geht die Adresse zurück auf `/` (wie bei den anderen Direktlinks der App): Ein späteres
  Neuladen öffnet die App normal, eine erneute Anmeldung führt nicht wieder zu Wichteln.
- Schließen führt wie gewohnt zur Event-Übersicht.
- Unter Rolle `edit` (auch Gäste und frisch Registrierte, die mit `read` starten) zeigt die Seite nur
  den Hinweis auf die nötige Rolle; der Server prüft die Rolle ohnehin selbst (`wichtelVerwalten`).
- Abgrenzung zu den persönlichen Links: Die haben immer Runde und Token dahinter. `/wichteln/` ohne
  beides gilt nicht als kaputter Teilnehmer-Link.

Code: `istWichtelSeitenPfad` in `src/utils/wichtelLinks.js`, Ablauf in `App.js` (`wichtelSeiteAngefragt`)
und `EventsPage` (`pendingWichtelSeite`); Tests in `App.auth.test.js`, `App.share.test.js`,
`EventsPage.test.js` und `wichtelLinks.test.js`.

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
| Dass es Neues über ihn gibt (Neuigkeiten-Mail, nur die Anzahl) | nein | ja, per Mail | nein | nein |
| Ob er schon Wünsche eingetragen hat (Erinnerungs-Mail) | ja, per Mail | nein | nein | nein |

Durchgesetzt wird das serverseitig, nicht in der Oberfläche:

- `firestore.rules`: `wichtelRunden` samt Unter-Collections ist für **jeden** Client gesperrt,
  auch für Organisator und Admins (Regeltest `rules-tests/wichteln.test.js`).
- Alle Zugriffe laufen über zwei Callables in `functions/wichteln.js`
  (Tests: `functions/wichteln.test.js`, u. a. „Wünsche und Ideen sieht nur, wer den Gast gezogen hat“).

Bewusste Grenzen: Der Organisator kennt alle Links und könnte einen fremden Link öffnen. Das liegt
am Verfahren „Organisator verschickt die Links“; die App zeigt ihm die Zuordnung nie. Ebenso kann
er mit Ausschlüssen die Auslosung so weit einengen, dass nur noch ein Kreis übrig bleibt – dann
kennt er die Zuordnung, ohne dass die App sie zeigt. Ausschlüsse sind ein Werkzeug des Organisators,
kein Schutz gegen ihn. Die Neuigkeiten-Mail geht an die Adresse, die der Organisator im Gästeprofil
pflegt; sie nennt deshalb weder den Empfänger noch Inhalte. Wer sie mitliest, erfährt daraus nicht, wer
wen beschenkt – der Link darin öffnet aber, wie jeder persönliche Link, die Seite des Schenkers.

## Datenmodell

```
wichtelRunden/{rundeId}            ownerId, titel, anlass (Schlüssel oder ''), budget, hinweis, datum (Tag der Feier
                                   'JJJJ-MM-TT' oder ''; fehlt bei älteren = keins), status ('offen'|'ausgelost'),
                                   teilnehmerAnzahl, ausgelostAm, erstelltAm, aktualisiertAm
  teilnehmer/{teilnehmerId}        name, token (geheim), reihenfolge, ausschluesse (Teilnehmer-IDs,
                                   die er nicht ziehen soll; fehlt bei älteren = keine), geoeffnetAm,
                                   gezogenAm, geschenkGekauftAm (fehlt bei älteren = nein), erstelltAm,
                                   gastId (→ guests/{ownerId}/profiles/{gastId} oder null), mailStatus
                                   ('gesendet'|'fehler'|null), mailAm (letzter Versuch),
                                   neuigkeitenMailAm (letzte Neuigkeiten-Mail), neuigkeitenBis
                                   (Zeitpunkt des neuesten darin gemeldeten Eintrags; beide fehlen = noch keine),
                                   erinnerungen (Anzahl verschickter Erinnerungen; fehlt nur bei Teilnehmern
                                   von vor der Erinnerungs-Mail), erinnerungAm (letzte Erinnerung)
  zuordnungen/{geberId}            empfaengerId, ausgelostAm
  eintraege/{eintragId}            autorId, ueberId, text, erstelltAm,
                                   url und vorschau {bild, titel, seite} (nur mit Link; vorschau null,
                                   wenn der Abruf scheiterte)

wichtelMailLimits/{uid}_{JJJJ-MM-TT}   uid, tag, anzahl   (Tageszähler je Organisator, Berliner Tag)
wichtelNeuigkeiten/{rundeId}_{geberId}  rundeId, geberId, faelligAm, zaehler (Einträge seit dem
                                        Vormerken), fehlversuche   (vorgemerkte Neuigkeiten-Mail; ohne
                                        Zuordnung, gelöscht nach dem Versand)
wichtelErinnerungen/{rundeId}_{teilnehmerId}  rundeId, teilnehmerId, faelligAm, fehlversuche   (nächste
                                        Erinnerung an einen Gast ohne Wünsche; ohne Zuordnung und Adresse)
```

Teilnehmer, die vor der Gast-Verknüpfung angelegt wurden, haben die drei Mail-Felder nicht; das liest
sich wie `null`. Die Oberfläche ordnet sie über den gleichen Namen einem Gast zu (Sprache beim Teilen,
„Per Mail senden“); beim ersten Senden wird die Verknüpfung gespeichert. Die Mail beim Auslosen geht nur
an gespeichert verknüpfte Teilnehmer.

Neue Gäste aus der Runde stehen in der Gästeliste des Organisators (`guests/{ownerId}/profiles/{gastId}`)
mit denselben Feldern wie aus „Gäste verwalten“: `id`, `vorname`, `nachname`, `email` ('' ohne), `kind`
false, `alkoholischeGetränke` true, `bevorzugteGetränke` und `bevorzugteKategorien` [], `präferenzFaktor`
0.5, `sprache` 'de', `erstellt`, `aktualisiert`, `erstelltVon` (`neuesGastprofil` in
`functions/wichteln.js`; ein Test prüft, dass `manageGuestProfile.js` es so annimmt).

Ein Wunsch ist ein Eintrag mit `autorId == ueberId`, eine Geschenkidee einer mit `autorId != ueberId`.
Teilnehmer-IDs sind keine Geheimnisse (sie stehen in der Gästeliste jedes Teilnehmers), das Token schon.

## Schnittstellen

`wichtelVerwalten` (angemeldet, nicht anonym, Rolle `edit`/`moderator`/`admin`, nur eigene Runden),
Feld `aktion`: `liste`, `laden`, `anlegen`, `aendern`, `teilnehmerHinzufuegen`, `teilnehmerUmbenennen`,
`teilnehmerEntfernen` (löscht auch seine Einträge und die Ideen über ihn und nimmt ihn aus den
Ausschlüssen der anderen), `ausschluesseSetzen` (`teilnehmerId`, `ausschluesse`: ersetzt die Liste, nur
vor dem Auslosen; unbekannte IDs und der Teilnehmer selbst fallen still heraus), `auslosen` (verschickt
danach die Einladungen), `zuruecksetzen`, `loeschen`, `einladungSenden` (`teilnehmerId`, optional
`gastId` zum Verknüpfen; erst nach dem Auslosen, vorher `failed-precondition`).
Fremde Runden antworten wie nicht vorhandene (`not-found`). Die Organisator-Sicht enthält je
Teilnehmer `ausschluesse`, `gastId` und `mail`; Teilnehmer-Antworten enthalten nichts davon.

`anlegen` und `aendern` (auch nach dem Auslosen) nehmen `titel`, `anlass`, `budget`, `hinweis` und `datum`
('JJJJ-MM-TT' zwischen 2020 und 2100, '' oder null löscht es; fehlt das Feld, bleibt es bei `aendern`
unverändert – ältere App-Versionen kennen es nicht). Runden-Antworten enthalten `datum` ('' ohne).

Bei `anlegen` und `teilnehmerHinzufuegen` ist jeder Eintrag in `namen`:

- `{vorname, nachname, email?}` (ohne `gastId`): neuer Gast. Vor- und Nachname sind Pflicht (je höchstens
  40 Zeichen; der Teilnehmername „Vorname Nachname“ wird auf 60 gekürzt), die Adresse optional. Der Server
  legt das Gästeprofil im selben Batch wie den Teilnehmer an – scheitert eine Prüfung, entsteht keins.
- `{name, gastId, email?}`: Gast aus der eigenen Gästeliste. `email` ergänzt eine dort fehlende Adresse;
  steht eine andere im Profil, antwortet der Server `failed-precondition` und trägt nichts ein.
- ein Name (ältere App-Versionen): Teilnehmer ohne Gast.

Adressen werden klein geschrieben und wie beim Versand geprüft (eine Adresse, höchstens 254 Zeichen);
eine ungültige ergibt `invalid-argument` mit dem Namen, nicht der Adresse. Eintragen verschickt keine
Mail. `auslosen` und `einladungSenden` antworten zusätzlich mit
`versand: {gesendet, fehlgeschlagen, grund}`; `grund` ist `nicht-eingerichtet` (SMTP-Secrets fehlen),
`limit` (Tageslimit) oder `fehler` (Mailserver, Limit oder Gästeliste nicht lesbar). Ein Fehler beim
Versand macht die Auslosung nicht rückgängig.

`wichtelTeilnahme` (ohne Login; `rundeId` + `token`), Feld `aktion`: `laden` (setzt „Link geöffnet“),
`ziehen`, `eintragHinzufuegen` (`ueberId`, `text` ≤ 300 Zeichen und/oder `url` ≤ 2000 Zeichen, höchstens
50 Einträge je Teilnehmer; ohne `https://` wird es ergänzt, andere Schemata sind ungültig),
`geschenkGekauft` (`gekauft`: true/false, nur nach dem Ziehen), `eintragLoeschen` (nur eigene). Einträge gehen mit `url` und `vorschau` (je `null` ohne Link) heraus. Falsches Format, unbekannte Runde und falsches Token geben dieselbe
Antwort (`not-found`).
Jede Antwort enthält `ich.sprache`: den Code aus dem verknüpften Gästeprofil
(`guests/{ownerId}/profiles/{gastId}`, Feld `sprache`; ohne Feld `de`), sonst `null`. Gelesen wird nur
unter den Profilen des Organisators der Runde, und vom Profil verlässt nur dieser Code den Server. Die
Fehlermeldungen des Servers sind deutsch; die Teilnehmerseite übersetzt nach Fehlercode.

`wichtelNeuigkeitenVersenden` (geplant, alle 15 Minuten, Zeitzone Europe/Berlin): verschickt fällige
Neuigkeiten-Mails (`versendeNeuigkeiten` in `functions/wichteln.js`). Ihr Button „Geschenk gekauft“
führt auf den persönlichen Link mit `?gekauft=1`; die Teilnehmerseite nimmt den Parameter sofort aus der
Adresse und zeigt die Rückfrage.

`wichtelErinnerungenVersenden` (geplant, stündlich von 9 bis 20 Uhr, Zeitzone Europe/Berlin): verschickt
fällige Erinnerungen an Gäste ohne Wünsche (`versendeErinnerungen` in `functions/wichteln.js`).

Client: `src/utils/wichtelFirestore.js`, Links und Teilen-Text: `src/utils/wichtelLinks.js`,
Oberflächen: `src/components/WichtelPage.js` (Organisator; Eintragen: `WichtelTeilnehmerFormular.js`,
Typeahead und Adressprüfung: `src/utils/wichtelGaeste.js`), `src/components/WichtelTeilnahmePage.js`
(Texte auf Deutsch, Englisch, Französisch und Wahl der Sprache: `src/utils/wichtelTeilnahmeTexte.js`).

## Neue Gäste aus der Runde

- **Eintragen:** Vorname und Nachname (Pflicht), E-Mail optional. Ohne passenden Gast legt `wichtelVerwalten`
  ein Gästeprofil in der Gästeliste des Organisators an und verknüpft es mit dem Teilnehmer; danach steht
  der Gast unter „Gäste verwalten“ wie jeder andere (Sprache Deutsch, Getränke-Angaben leer). Die App meldet
  „… ist dabei und steht jetzt auch in deiner Gästeliste.“
- **Schon in der Gästeliste:** Entspricht „Vorname Nachname“ genau einem Gast (Groß-/Kleinschreibung egal),
  verknüpft die App diesen. Eine eingetippte Adresse ergänzt eine im Profil fehlende; eine andere
  gespeicherte überschreibt sie nicht – die App meldet das, geändert wird unter „Gäste verwalten“.
- **Typeahead:** Beim Tippen in Vor- oder Nachname erscheinen passende Gäste als Pillen („Aus deiner
  Gästeliste:“), höchstens acht, nach Namen sortiert. Das Feld Vorname sucht im Vornamen, das Feld Nachname
  im Nachnamen; sind beide ausgefüllt, müssen beide passen. Gesucht wird am Anfang eines Namens oder
  Namensteils („lena“ findet „Anna-Lena“, „mus“ findet „von Muster“), ohne Rücksicht auf Groß-/Kleinschreibung
  und Akzente, ß wie ss; der ganze Name im Vornamenfeld („Anna Mu“) findet den Gast ebenfalls. Gäste, die
  schon dabei sind, erscheinen nicht. Ein Tipp auf die Pille trägt den Gast ein (eine eingetippte Adresse
  geht wie oben mit).
- **Adressprüfung:** wie beim Versand (`EMAIL_MUSTER` in `functions/wichteln.js`, dieselbe Regel in
  `src/utils/wichtelGaeste.js`; ein Test hält beide gleich). Die App prüft vor dem Absenden und zeigt den
  Fehler am Feld.

## Einladung per Mail

- **Wann:** beim Auslosen an jeden Teilnehmer, der mit einem Gast mit E-Mail-Adresse verknüpft ist und
  noch keine zugestellte Einladung hat (`ladeZurAuslosungEin`), danach auf „Per Mail senden“ / „Erneut
  senden“. Vor dem Auslosen geht keine raus, auch nicht von Hand. Nach „Auslosung zurücksetzen“ und neuem
  Auslosen bekommt nur eine Mail, wer noch keine zugestellte hatte (neu eingetragen oder Versand
  gescheitert); der Link bleibt derselbe. Runden von vor dieser Regel (10. 11. 2026): Wer seine Einladung
  schon beim Eintragen bekam, bekommt beim Auslosen keine zweite.
- **Sprache:** Feld `sprache` im Gästeprofil (`de`, `en`, `fr`), auswählbar unter Gäste verwalten.
  Profile ohne das Feld – alle, die vor der Sprachwahl angelegt wurden – gelten als Deutsch; ein
  Speichern ohne Feld (ältere App-Version) überschreibt eine gesetzte Sprache nicht. Die Liste steht in
  `functions/shared/sprachen.js` und `src/utils/guestPreferences.js`, ein Test hält beide gleich.
- **Inhalt** (`functions/wichtelMail.js`, Text und HTML): zwei Varianten, gewählt nur nach dem Anlass der
  Runde – `north_pole` („Post vom Nordpol“) bei Weihnachten und Nikolaus, `warm_casual` („Herzlich & locker“)
  bei allem anderen und bei Runden ohne Anlass. Die Texte stehen je Sprache in `functions/wichtelMailTexte/`
  (`de.js`, `en.js`, `fr.js`, Schlüssel `einladung`) mit den Platzhaltern `{firstName}` (nur der erste Teil des Teilnehmernamens),
  `{hostName}` (Vorname des Organisators), `{eventName}`, `{budget}`, `{datum}`, `{link}`; im HTML wird jeder Wert escaped.
  Das Budget steht bei einem reinen Betrag in der Schreibweise der Sprache („50,00 €“, „€50.00“), sonst so, wie
  der Organisator es schrieb; das Datum der Feier ausgeschrieben („📅 Bescherung: Sonntag, 13. Dezember 2026“,
  herzlich „Feier: …“), direkt über dem Budget. Der Link steht im Button und als Fallback-Text. Ohne Datum oder
  Budget entfällt die Zeile, ohne Vorname des Organisators gibt es einen neutralen Einladungssatz. Der Hinweis der Runde und
  die Zeile „Du bekommst diese Mail, weil …“ stehen dezent (klein, grau) unter dem Haupttext.
- **Empfänger:** nur Adressen aus der Gästeliste des Organisators (auch die beim Eintragen neu angelegter
  Gäste). Adresse und Sprache liest die Function bei jedem Versand frisch aus dem Gästeprofil – wer vor dem
  Auslosen die Sprache oder Adresse unter „Gäste verwalten“ ändert, bekommt die Einladung schon so; in der
  Runde stehen nur `gastId` und das Ergebnis.
- **Grenzen:** höchstens 150 Mails je Organisator und Berliner Tag (`wichtelMailLimits`, jeder Versuch
  zählt; ist der Zähler nicht prüfbar, geht keine Mail raus). Logs nennen nur Teilnehmer- und
  Runden-IDs und Fehlercodes des Mailservers, nie die Adresse (Tech-Check S26).
- **Versand:** SMTP-Secrets `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` (dieselben
  wie für die Listen-Einladung), nodemailer mit kleinem Pool, Function-Timeout 120 s.
- **Absender:** Adresse aus `SMTP_FROM`, Anzeigename je Variante und Sprache aus `absender` in
  `functions/wichtelMailTexte/<sprache>.js` – gilt für Einladung, Erinnerung und Neuigkeiten:
  `north_pole` „Wichtelpost vom Nordpol“ / „Post from the North Pole“ / „Courrier du pôle Nord“,
  `warm_casual` „Wichtelpost“ / „Gift Exchange“ / „Échange de cadeaux“ (bewusst ohne Weihnachtsbezug und
  ohne App-Namen). Ein Name in `SMTP_FROM` („Name <adresse>“) wird für Wichtel-Mails ersetzt; die anderen
  Mails der App behalten `SMTP_FROM` unverändert.

## Neuigkeiten per Mail

- **Wann:** Trägt der Empfänger eines Schenkers einen Wunsch ein oder ein anderer Gast eine Idee für ihn,
  merkt `wichtelTeilnahme` eine Mail an den Schenker vor (`wichtelNeuigkeiten/{rundeId}_{geberId}`) – nur,
  wenn die Runde ausgelost ist, der Schenker sein Los gezogen und „Geschenk gekauft“ nicht gesetzt hat und
  sein Gästeprofil eine E-Mail-Adresse hat. Eigene Ideen des Schenkers lösen nichts aus. Ab dem Tag der Feier
  (Datum der Runde, Berliner Zeit) wird nichts mehr vorgemerkt, und schon vorgemerkte Mails entfallen.
- **Bündeln:** Die Mail geht frühestens 30 Minuten nach dem ersten neuen Eintrag raus (mehrere Einträge
  kurz hintereinander ergeben eine Mail) und höchstens einmal am Tag je Schenker. Verschickt wird sie von
  der geplanten Function `wichtelNeuigkeitenVersenden`, die vorher alles neu prüft: Ist inzwischen
  „Geschenk gekauft“ gesetzt, die Auslosung zurückgesetzt, die Runde gelöscht, die Adresse entfernt oder
  der Eintrag wieder gelöscht, entfällt die Mail. Gemeldet wird, was seit dem Ziehen und seit dem neuesten
  Eintrag der letzten Mail dazukam; kommt während des Versands noch etwas dazu, folgt es mit der nächsten.
- **Inhalt** (`baueNeuigkeitenMail` in `functions/wichtelMail.js`, Texte unter `neuigkeiten` in
  `functions/wichtelMailTexte/`): dieselben Varianten (`north_pole`, `warm_casual`) und Sprachen wie die
  Einladung. Die Mail nennt nur die Anzahl neuer Wünsche und Ideen, **nie den Empfänger und keine
  Inhalte** (Vorschau auf dem Sperrbildschirm, geteilte Postfächer; die Einträge stehen hinter dem Link).
  Dazu Datum der Feier, Budget und Hinweis der Runde, der Button zur Linkseite und der Button „Geschenk gekauft“, beide
  Links auch als Fallback-Text.
- **„Geschenk gekauft“ aus der Mail:** Der Button öffnet den persönlichen Link mit `?gekauft=1`. Die Seite
  fragt oben nach („Geschenk für … gekauft?“); gesetzt wird der Status erst mit „Ja, Geschenk gekauft“.
  Der Link allein setzt bewusst nichts: Link-Scanner der Mailprogramme öffnen Links auch ungefragt.
- **Grenzen:** zählt zum Tageslimit des Organisators (150 Mails). Ist es erreicht, der Mailversand nicht
  eingerichtet oder der Mailserver nicht erreichbar, folgt eine Stunde später ein neuer Versuch; nach drei
  gescheiterten Sendeversuchen entfällt die Mail. Logs nennen nur IDs und Fehlercodes, nie die Adresse.

## Erinnerung per Mail

- **Wer:** Teilnehmer, deren Einladung per Mail zugestellt wurde und die noch keinen eigenen Wunsch
  eingetragen haben. Da die Einladung mit dem Auslosen kommt, ist das nach dem Auslosen; bei Runden von
  vor dem 10. 11. 2026 auch davor. Ideen für andere zählen nicht als Wunsch.
- **Wann:** Jede zugestellte Einladung (auch „Erneut senden“) merkt die erste Erinnerung drei Tage später
  vor (`wichtelErinnerungen/{rundeId}_{teilnehmerId}`). Danach folgt wöchentlich eine weitere, höchstens drei
  insgesamt; erneutes Senden der Einladung setzt den Zähler nicht zurück und hält eine Woche Abstand zur
  letzten Erinnerung. Verschickt wird von der geplanten Function `wichtelErinnerungenVersenden`, stündlich von
  9 bis 20 Uhr (Berliner Zeit) – nachts geht keine raus, was dann fällig wird, folgt um 9 Uhr.
- **Wann nicht mehr:** Vor dem Versand wird alles neu geprüft. Die Erinnerung entfällt, sobald der Gast einen
  Wunsch eingetragen hat, sein Schenker das Geschenk als gekauft markiert hat (dann helfen Wünsche nicht
  mehr), die Adresse aus dem Gästeprofil entfernt, der Teilnehmer entfernt oder die Runde gelöscht wurde.
  „Auslosung zurücksetzen“ ändert nichts, Wünsche bleiben dabei ja auch erhalten.
- **Datum der Feier:** Hat die Runde eins, kommt die letzte Erinnerung spätestens drei Tage vorher (Berliner
  Kalendertag); was danach fällig wäre, entfällt – liegt die Feier schon bei der ersten zu nah, kommt keine.
  Wird das Datum später gelegt oder gelöscht, merkt „Runde bearbeiten“ die Erinnerungen neu vor
  (`planeErinnerungen`), mit einer Woche Abstand zur letzten; ein früheres Datum prüft der Versand.
- **Inhalt** (`baueErinnerungsMail` in `functions/wichtelMail.js`, Texte unter `erinnerung` in
  `functions/wichtelMailTexte/`): dieselben Varianten (`north_pole`, `warm_casual`) und Sprachen wie die
  Einladung, derselbe Aufbau (Datum der Feier, Budget, Hinweis, Button zur Linkseite mit Fallback-Link). Der Text gilt vor und
  nach dem Auslosen und nennt niemanden aus der Runde.
- **Wer davon weiß:** nur der Gast selbst. Der Organisator sieht nicht, wer erinnert wird – das verriete, wer
  noch keine Wünsche hat. In der Runde steht nur der Zähler am Teilnehmer.
- **Grenzen:** zählt zum Tageslimit des Organisators (150 Mails); Limit, fehlender Mailversand und Fehler
  verschieben wie bei der Neuigkeiten-Mail um eine Stunde, nach drei gescheiterten Sendeversuchen entfällt die
  Erinnerung. Logs nennen nur IDs und Fehlercodes.
- **Übergang:** Teilnehmer, deren Einladung vor der Erinnerungs-Mail (9. 11. 2026) zugestellt wurde, haben
  noch keinen Vormerker. Er entsteht einmalig, wenn der Organisator die Runde öffnet – fällig drei Tage nach
  der Einladung, frühestens sofort.

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
- Neuigkeiten-Mail abbestellen, ohne „Geschenk gekauft“ zu setzen (heute nur über den Status oder ohne
  Adresse im Gästeprofil).
- Öffnet der Schenker die Linkseite, bevor eine vorgemerkte Neuigkeiten-Mail rausgeht, meldet sie trotzdem
  die Einträge, die er dort schon gesehen hat (die Seite merkt sich keinen „gesehen“-Stand).
- Keine Mail nach „Auslosung zurücksetzen“ und neuem Auslosen an Gäste, die ihre Einladung schon haben –
  wer schon gezogen hatte, erfährt nicht, dass er neu ziehen muss (heute: „Erneut senden“). Ebenso bei
  Runden von vor dem 10. 11. 2026, deren Gäste ihre Einladung schon beim Eintragen bekamen.
- Sprache eines neuen Gasts gleich beim Eintragen wählen – heute Deutsch, ändern unter „Gäste verwalten“
  (vor dem Auslosen, dann kommt schon die Einladung in der richtigen Sprache).
- Mehrere Teilnehmer auf einmal eintragen (früher kommagetrennt) – heute je Teilnehmer ein Eintrag.
- Ohne Datum der Feier enden Erinnerungen an Wünsche erst nach dreien, einem Wunsch oder „Geschenk gekauft“
  beim Schenker – bei einer Einladung kurz vor der Feier kann die letzte danach kommen.
- Erinnerungen abbestellen, ohne einen Wunsch einzutragen („Ich wünsche mir nichts“).
- Button der Erinnerungs-Mail direkt zum Abschnitt „Deine Wünsche“ (heute: Anfang der Linkseite).
