# Wichteln

Wichtel-Runden für Feiern: Teilnehmer eintragen, auslosen, jeder bekommt einen
persönlichen Link. Über den Link zieht er sein Los, sieht die Wünsche seines
Wichtelpartners und kann Geschenkideen für andere Gäste hinterlassen.

## Ablauf

**Organisator** (Events > „Wichteln“, mobil der Geschenk-Button unten links; ab Rolle `edit`):

1. Runde anlegen: Titel, optional Budget und Hinweis (z. B. „Bescherung am 13.12.“).
2. Teilnehmer eintragen – mehrere auf einmal mit Komma, oder per Tipp aus der eigenen Gästeliste.
   Namen sind je Runde eindeutig (Groß-/Kleinschreibung egal).
3. Optional Ausschlüsse (ab drei Teilnehmern): in der Zeile eines Teilnehmers „Ausschlüsse“ öffnen
   und antippen, wen er nicht ziehen soll. Jeder Tipp speichert sofort. Ein Ausschluss gilt nur in
   eine Richtung – bei Paaren für beide setzen. Einen Gast muss jeder beschenken können, der letzte
   freie lässt sich nicht ausschließen. Zugeklappt steht in der Zeile „Beschenkt nicht: …“.
4. Links verschicken („Link teilen“: Teilen-Menü des Handys, sonst Kopieren). Das geht schon vor
   dem Auslosen – dann können alle früh ihre Wünsche eintragen.
5. „Jetzt auslosen“ (ab drei Teilnehmern). Lassen die Ausschlüsse keine Auslosung zu, sagt die App,
   woran es liegt (z. B. „Für „Anna“ sind alle anderen ausgeschlossen“). Danach sind Teilnehmer und
   Ausschlüsse gesperrt; ändern geht erst nach „Auslosung zurücksetzen“ (mit Rückfrage). Links,
   Ausschlüsse, Wünsche und Ideen bleiben dabei erhalten, wer schon gezogen hatte, zieht nach dem
   nächsten Auslosen neu.
6. Je Teilnehmer sichtbar: „Link noch nicht geöffnet“ / „Link geöffnet“ / „Los gezogen“.

**Teilnehmer** (`/wichteln/{rundeId}/{token}`, ohne Login):

- „Los ziehen“: der Zettel klappt auf und zeigt, wen man beschenkt (ohne Animation bei
  „Bewegung reduzieren“).
- Danach: Wünsche des Gezogenen und Ideen anderer Gäste für ihn (mit Absender).
- „Deine Wünsche“: sieht nur, wer einen gezogen hat.
- „Geschenkideen für andere“: Gast wählen, Idee speichern. Sieht nur, wer diesen Gast gezogen hat –
  mit dem eigenen Namen, die Person selbst nie.
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
wichtelRunden/{rundeId}            ownerId, titel, budget, hinweis, status ('offen'|'ausgelost'),
                                   teilnehmerAnzahl, ausgelostAm, erstelltAm, aktualisiertAm
  teilnehmer/{teilnehmerId}        name, token (geheim), reihenfolge, ausschluesse (Teilnehmer-IDs,
                                   die er nicht ziehen soll; fehlt bei älteren = keine), geoeffnetAm,
                                   gezogenAm, erstelltAm
  zuordnungen/{geberId}            empfaengerId, ausgelostAm
  eintraege/{eintragId}            autorId, ueberId, text, erstelltAm
```

Ein Wunsch ist ein Eintrag mit `autorId == ueberId`, eine Geschenkidee einer mit `autorId != ueberId`.
Teilnehmer-IDs sind keine Geheimnisse (sie stehen in der Gästeliste jedes Teilnehmers), das Token schon.

## Schnittstellen

`wichtelVerwalten` (angemeldet, nicht anonym, Rolle `edit`/`moderator`/`admin`, nur eigene Runden),
Feld `aktion`: `liste`, `laden`, `anlegen`, `aendern`, `teilnehmerHinzufuegen`, `teilnehmerUmbenennen`,
`teilnehmerEntfernen` (löscht auch seine Einträge und die Ideen über ihn und nimmt ihn aus den
Ausschlüssen der anderen), `ausschluesseSetzen` (`teilnehmerId`, `ausschluesse`: ersetzt die Liste, nur
vor dem Auslosen; unbekannte IDs und der Teilnehmer selbst fallen still heraus), `auslosen`,
`zuruecksetzen`, `loeschen`. Fremde Runden antworten wie nicht vorhandene (`not-found`). Die
Organisator-Sicht enthält je Teilnehmer `ausschluesse`; Teilnehmer-Antworten enthalten sie nie.

`wichtelTeilnahme` (ohne Login; `rundeId` + `token`), Feld `aktion`: `laden` (setzt „Link geöffnet“),
`ziehen`, `eintragHinzufuegen` (`ueberId`, `text` ≤ 300 Zeichen, höchstens 50 Einträge je Teilnehmer),
`eintragLoeschen` (nur eigene). Falsches Format, unbekannte Runde und falsches Token geben dieselbe
Antwort (`not-found`).
Jede Antwort enthält `ich.sprache`: den Code aus dem verknüpften Gästeprofil
(`guests/{ownerId}/profiles/{gastId}`, Feld `sprache`; ohne Feld `de`), sonst `null`. Gelesen wird nur
unter den Profilen des Organisators der Runde, und vom Profil verlässt nur dieser Code den Server. Die
Fehlermeldungen des Servers sind deutsch; die Teilnehmerseite übersetzt nach Fehlercode.

Client: `src/utils/wichtelFirestore.js`, Links: `src/utils/wichtelLinks.js`,
Oberflächen: `src/components/WichtelPage.js` (Organisator), `src/components/WichtelTeilnahmePage.js`
(Texte auf Deutsch, Englisch, Französisch und Wahl der Sprache: `src/utils/wichtelTeilnahmeTexte.js`).

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
