/**
 * Wichteln: Runden, Teilnehmer, Auslosung, Wünsche und Geschenkideen.
 *
 * Alle Daten liegen unter wichtelRunden/{rundeId} und sind für Clients gesperrt
 * (firestore.rules). Zugriff nur über die beiden Callables in handlers/wichteln.js:
 *  - wichtelVerwalten: Organisator (angemeldetes Mitglied ab Rolle edit, Besitzer der Runde)
 *  - wichtelTeilnahme: Teilnehmer per persönlichem Link (rundeId + geheimes Token), ohne Login
 *
 * Geheimhaltung:
 *  - Wer wen gezogen hat (zuordnungen/{geberId}), verlässt den Server nur in der Antwort an
 *    den Ziehenden selbst. Der Organisator sieht je Teilnehmer nur „Link geöffnet“ und
 *    „Los gezogen“, nie die Zuordnung.
 *  - Einträge über einen Teilnehmer (seine Wünsche, Ideen anderer) sieht nur, wer ihn gezogen
 *    hat. Jeder sieht außerdem die eigenen Einträge, nie aber Ideen, die andere über ihn
 *    geschrieben haben.
 *  - Teilnehmer-IDs sind keine Geheimnisse (sie stehen in Listen für alle Teilnehmer), das
 *    Token schon: es steht nur in der Organisator-Ansicht und im persönlichen Link.
 *  - Ausschlüsse (wen ein Teilnehmer nicht ziehen soll) legt der Organisator fest; sie
 *    stehen am Teilnehmer und gehen nur an den Organisator zurück, nie an Teilnehmer.
 *
 * Einladung per Mail: Ein Teilnehmer kann mit einem Gast aus der eigenen Gästeliste des
 * Organisators verknüpft sein (gastId → guests/{ownerId}/profiles/{gastId}). Wer mit Vor- und
 * Nachname neu eingetragen wird, bekommt dort im selben Schritt ein Gästeprofil (neuesGastprofil).
 * Hat der Gast eine E-Mail-Adresse, geht der persönliche Link beim Auslosen automatisch per Mail
 * raus – nicht schon beim Eintragen –, in der Sprache aus dem Gästeprofil (wichtelMail.js). Adresse
 * und Sprache werden bei jedem Versand frisch aus dem Gästeprofil gelesen und nie in der Runde
 * gespeichert; Empfänger sind nur Adressen aus der eigenen Gästeliste, je Organisator höchstens
 * MAX_MAILS_PRO_TAG am Tag (gegen Missbrauch als Mail-Relay, vgl. Tech-Check S6).
 *
 * Einträge (Wünsche, Ideen) haben Text und/oder einen Link. Zum Link holt der Server beim
 * Speichern einmal eine Vorschau (Bild, Titel, Seite; linkVorschau.js) und legt sie mit ab.
 *
 * Neuigkeiten per Mail: Trägt der Empfänger eines Schenkers Wünsche ein oder ein anderer Gast
 * Ideen für ihn, merkt merkeNeuigkeitVor eine Mail an den Schenker vor – nur, solange er sein
 * Los gezogen und das Geschenk nicht als gekauft markiert hat, und nur mit E-Mail-Adresse im
 * verknüpften Gästeprofil. Die geplante Function wichtelNeuigkeitenVersenden schickt sie
 * gebündelt (versendeNeuigkeiten): frühestens SAMMELFENSTER_MS nach dem ersten neuen Eintrag,
 * höchstens eine je MINDESTABSTAND_MS. Die Mail nennt weder den Empfänger noch Inhalte, nur
 * die Anzahl; die Vormerker (wichtelNeuigkeiten) enthalten keine Zuordnung.
 *
 * Erinnerung per Mail: Wer seine Einladung per Mail bekommen und noch keinen Wunsch eingetragen
 * hat, wird daran erinnert – zuerst ERINNERUNG_NACH_MS nach der Einladung, dann je
 * ERINNERUNG_ABSTAND_MS, höchstens MAX_ERINNERUNGEN-mal. Die Einladung merkt die erste vor
 * (wichtelErinnerungen), die geplante Function wichtelErinnerungenVersenden verschickt sie
 * (versendeErinnerungen) und prüft vorher alles neu. Sie entfällt, sobald der Gast einen Wunsch
 * hat, sein Schenker das Geschenk als gekauft markiert hat oder die Feier (Feld `datum` der Runde,
 * optional) weniger als ERINNERUNG_VORLAUF_TAGE entfernt ist. Neuigkeiten-Mails enden mit dem
 * Tag der Feier.
 *
 * Aufbau wie follow.js: reine Funktionen mit (admin, db, HttpsError, params), damit die
 * Tests sie mit einem Firestore-Ersatz aufrufen können. Den SMTP-Versand reicht der
 * Handler als `mailer` herein (handlers/wichteln.js).
 */

const crypto = require('crypto');
const linkVorschau = require('./linkVorschau');
const {normalisiereSprache, STANDARD_SPRACHE} = require('./shared/sprachen');
const {baueEinladungsMail, baueNeuigkeitenMail, baueErinnerungsMail} = require('./wichtelMail');

const COLLECTION = 'wichtelRunden';
const MAIL_LIMIT_COLLECTION = 'wichtelMailLimits';
// Vorgemerkte Neuigkeiten-Mails, je Runde und Schenker ein Dokument {rundeId}_{geberId}
const NEUIGKEITEN_COLLECTION = 'wichtelNeuigkeiten';
// Vorgemerkte Erinnerungen an Gäste ohne Wünsche, je Runde und Teilnehmer {rundeId}_{teilnehmerId}
const ERINNERUNGEN_COLLECTION = 'wichtelErinnerungen';
// Adresse der App für die Links in Mails (wie ALLOWED_ORIGINS[0] in shared/common.js). Die
// App selbst baut den Link mit der Adresse, unter der sie läuft (src/utils/wichtelLinks.js).
const APP_URL = 'https://broubook.web.app';
// Je Organisator und Berliner Tag: eine volle Runde (MAX_TEILNEHMER) plus erneutes Senden.
// Gezählt wird jeder Versuch, auch ein fehlgeschlagener.
const MAX_MAILS_PRO_TAG = 150;
const MIN_TEILNEHMER = 3;
const MAX_TEILNEHMER = 100;
const MAX_RUNDEN = 50;
const MAX_EINTRAEGE_PRO_AUTOR = 50;
// Obergrenze beim Lesen der Einträge über einen Teilnehmer: höchstens alle anderen mit
// ihrem vollen Kontingent. Real sind es eine Handvoll.
const MAX_EINTRAEGE_UEBER = MAX_TEILNEHMER * MAX_EINTRAEGE_PRO_AUTOR;
const BATCH_GROESSE = 400;
// Auslosung mit Ausschlüssen: so viele zufällige Kreise werden gezogen und verworfen,
// bevor gezielt gesucht wird (bei 100 Teilnehmern rund 40 ms), und so viele Schritte
// darf die gezielte Suche gehen (lösbare Fälle brauchen meist nur einen je Teilnehmer;
// ein unlösbarer mit 100 Teilnehmern gibt nach rund 0,2 s auf).
const MAX_VERSUCHE = 2000;
const MAX_SUCHSCHRITTE = 20000;

// Neuigkeiten-Mail: frühestens 30 Minuten nach dem ersten neuen Eintrag (wer mehrere Wünsche
// hintereinander einträgt, löst eine Mail aus) und höchstens eine am Tag je Schenker. Scheitert
// der Versand oder ist das Tageslimit erreicht, folgt eine Stunde später ein neuer Versuch;
// nach MAX_FEHLVERSUCHE gescheiterten Versuchen wird die Mail verworfen.
const SAMMELFENSTER_MS = 30 * 60 * 1000;
const MINDESTABSTAND_MS = 24 * 60 * 60 * 1000;
const NEUER_VERSUCH_MS = 60 * 60 * 1000;
const MAX_FEHLVERSUCHE = 3;
// Erinnerung an Gäste ohne Wünsche: drei Tage nach der Einladung, danach wöchentlich, höchstens
// dreimal (bei einer Einladung drei Wochen vor der Feier: nach 3, 10 und 17 Tagen). Wiederholungen
// und Fehlversuche wie bei der Neuigkeiten-Mail (NEUER_VERSUCH_MS, MAX_FEHLVERSUCHE).
const ERINNERUNG_NACH_MS = 3 * 24 * 60 * 60 * 1000;
const ERINNERUNG_ABSTAND_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ERINNERUNGEN = 3;
// Hat die Runde ein Datum der Feier, kommt die letzte Erinnerung spätestens so viele Tage vorher
// (danach bringt ein neuer Wunsch dem Schenker kaum noch etwas). Neuigkeiten-Mails gehen bis zum
// Vortag der Feier.
const ERINNERUNG_VORLAUF_TAGE = 3;
// Je Lauf einer geplanten Function höchstens so viele Vormerker, älteste zuerst.
const MAX_VORMERKER_PRO_LAUF = 50;
// Parameter am persönlichen Link: öffnet die Seite mit der Rückfrage „Geschenk gekauft?“
// (src/components/WichtelTeilnahmePage.js liest ihn).
const GEKAUFT_PARAMETER = 'gekauft=1';

// vorname, nachname: neuer Gast aus der Runde; „Vorname Nachname“ wird als Teilnehmername auf
// `name` gekürzt (nur bei sehr langen Namen). email: Höchstlänge einer Adresse (RFC 5321).
const LAENGE = {titel: 80, budget: 40, hinweis: 300, name: 60, text: 300, vorname: 40, nachname: 40, email: 254};
// Datum der Feier (optional): Kalendertag ohne Uhrzeit, wie <input type="date"> ihn liefert.
const DATUM_MUSTER = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATUM_JAHRE = {von: 2020, bis: 2100};
// Anlass der Runde (optional); gleiche Liste wie src/utils/wichtelAnlaesse.js
const ANLAESSE = new Set(['weihnachten', 'nikolaus', 'silvester', 'ostern', 'geburtstag', 'hochzeit', 'jubilaeum', 'firmenfeier', 'sommerfest', 'abschied', 'einweihung', 'sonstiges']);
const ORGANISATOR_ROLLEN = new Set(['edit', 'moderator', 'admin']);
// Ergebnis der letzten Einladungs-Mail je Teilnehmer (Feld mailStatus)
const MAIL_STATUS = new Set(['gesendet', 'fehler']);

// Firestore-Auto-IDs (20 Zeichen); etwas Spielraum, keine Schrägstriche.
const ID_MUSTER = /^[A-Za-z0-9]{10,40}$/;
// 24 Zufallsbytes als base64url = 32 Zeichen (192 Bit).
const TOKEN_MUSTER = /^[A-Za-z0-9_-]{32}$/;
// Wie die Prüfung in manageGuestProfile.js, zusätzlich ohne Zeichen, die eine Adressliste
// trennen oder umschließen (eine Adresse = genau ein Empfänger). Die App prüft beim Eintragen
// genauso (src/utils/wichtelGaeste.js, ein Test hält beide gleich).
const EMAIL_MUSTER = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

const LINK_UNGUELTIG = 'Dieser Wichtel-Link ist ungültig oder die Runde wurde gelöscht.';
const RUNDE_FEHLT = 'Diese Wichtel-Runde gibt es nicht (mehr).';

/**
 * Einzeiliger, gekürzter Text; alles andere als ein String wird leer.
 * @param {*} value - Eingabe
 * @param {number} max - Höchstlänge
 * @return {string}
 */
function bereinige(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/**
 * @param {*} ts - Firestore-Timestamp (oder Platzhalter)
 * @return {number|null} Millisekunden oder null
 */
function millis(ts) {
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : null;
}

/** Erstellzeit zum Sortieren; ein noch nicht aufgelöster Server-Zeitstempel ist „jetzt“. */
function sortierZeit(ts) {
  const ms = typeof ts === 'number' ? ts : millis(ts);
  return ms === null ? Number.MAX_SAFE_INTEGER : ms;
}

/** Älteste zuerst. */
function nachErstellung(a, b) {
  return sortierZeit(a.erstelltAm) - sortierZeit(b.erstelltAm);
}

function nachName(a, b) {
  return String(a.name).localeCompare(String(b.name), 'de', {sensitivity: 'base'});
}

function schluessel(name) {
  return name.toLocaleLowerCase('de');
}

/** @return {string} geheimes Teilnehmer-Token (192 Bit, base64url) */
function neuesToken() {
  return crypto.randomBytes(24).toString('base64url');
}

/**
 * Fisher-Yates mit dem übergebenen Zufall.
 * @param {Array} liste - bleibt unverändert
 * @param {function(number): number} randomInt - liefert eine Zahl in [0, max)
 * @return {Array} neue, gemischte Liste
 */
function mische(liste, randomInt) {
  const reihe = [...liste];
  for (let i = reihe.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [reihe[i], reihe[j]] = [reihe[j], reihe[i]];
  }
  return reihe;
}

/** Jeder in der Reihe beschenkt seinen Nachfolger, der Letzte den Ersten. */
function kreisAus(reihe) {
  const zuordnung = {};
  reihe.forEach((id, i) => {
    zuordnung[id] = reihe[(i + 1) % reihe.length];
  });
  return zuordnung;
}

/**
 * @param {Map<string, Iterable<string>>} [ausschluesse] - geberId -> wen er nicht ziehen soll
 * @return {function(string, string): boolean} ob geber den empfaenger nicht ziehen darf
 */
function sperrPruefung(ausschluesse) {
  const sperren = new Map([...(ausschluesse || [])].map(([geber, ids]) => [geber, new Set(ids)]));
  return (geber, empfaenger) => Boolean(sperren.get(geber)?.has(empfaenger));
}

/**
 * Offensichtliche Sackgasse: jemand darf niemanden ziehen, oder niemand darf ihn ziehen.
 * Dann gibt es keinen Kreis, und die Suche braucht gar nicht erst zu laufen.
 * @param {string[]} ids - Teilnehmer-IDs
 * @param {function(string, string): boolean} gesperrt - aus sperrPruefung
 * @return {{id: string, art: 'schenkt'|'bekommt'}|null} art 'schenkt': id darf niemanden
 *     ziehen; 'bekommt': niemand darf id ziehen
 */
function findeEngpass(ids, gesperrt) {
  for (const id of ids) {
    if (ids.every((anderer) => anderer === id || gesperrt(id, anderer))) return {id, art: 'schenkt'};
    if (ids.every((anderer) => anderer === id || gesperrt(anderer, id))) return {id, art: 'bekommt'};
  }
  return null;
}

/**
 * Sucht gezielt einen erlaubten Kreis: verlängert die Reihe Schritt für Schritt und geht
 * bei einer Sackgasse zurück. Zwei Regeln halten die Suche kurz:
 *  - Als Nächster kommt zuerst, wer selbst die wenigsten Möglichkeiten hat (bei Gleichstand
 *    zufällig). So bleiben Eingeschränkte – etwa ein großes Team, das sich nicht selbst
 *    ziehen darf – nicht für den Schluss übrig.
 *  - Hat ein noch Freier keinen möglichen Empfänger oder keinen möglichen Geber mehr, wird
 *    der Zweig sofort verworfen.
 * Gibt nach MAX_SUCHSCHRITTE auf.
 * @param {string[]} ids - Teilnehmer-IDs
 * @param {function(string, string): boolean} gesperrt - aus sperrPruefung
 * @param {function(number): number} randomInt - liefert eine Zahl in [0, max)
 * @return {Object<string, string>|null}
 */
function sucheKreis(ids, gesperrt, randomInt) {
  const empfaenger = new Map(ids.map((id) => [
    id, mische(ids.filter((x) => x !== id && !gesperrt(id, x)), randomInt),
  ]));
  const geber = new Map(ids.map((id) => [id, ids.filter((x) => x !== id && !gesperrt(x, id))]));
  const start = ids[randomInt(ids.length)];
  const reihe = [start];
  const frei = new Set(ids.filter((id) => id !== start));
  // Mögliche Empfänger je Teilnehmer: die Freien, dazu der Start (für den Schluss).
  const ausgaenge = new Map(ids.map((id) => [id, empfaenger.get(id).length]));
  // Mögliche Geber je Teilnehmer: die Freien und das aktuelle Ende der Reihe.
  const eingaenge = new Map(ids.map((id) => [id, geber.get(id).length]));
  const zaehle = (karte, liste, plus) => liste.forEach((id) => karte.set(id, karte.get(id) + plus));
  const brauchtGeber = (id) => frei.has(id) || id === start;
  let schritte = 0;

  /** Hängt naechster an; false, wenn danach ein Freier ohne Empfänger oder Geber dasteht. */
  const haengeAn = (aktuell, naechster) => {
    reihe.push(naechster);
    frei.delete(naechster);
    zaehle(ausgaenge, geber.get(naechster), -1);
    zaehle(eingaenge, empfaenger.get(aktuell), -1);
    return geber.get(naechster).every((id) => !frei.has(id) || ausgaenge.get(id) > 0) &&
        empfaenger.get(aktuell).every((id) => !brauchtGeber(id) || eingaenge.get(id) > 0);
  };
  const nimmZurueck = (aktuell, naechster) => {
    reihe.pop();
    frei.add(naechster);
    zaehle(ausgaenge, geber.get(naechster), 1);
    zaehle(eingaenge, empfaenger.get(aktuell), 1);
  };
  const weiter = (aktuell) => {
    if (frei.size === 0) return !gesperrt(aktuell, start);
    const kandidaten = empfaenger.get(aktuell)
        .filter((id) => frei.has(id))
        .sort((a, b) => ausgaenge.get(a) - ausgaenge.get(b));
    for (const naechster of kandidaten) {
      schritte += 1;
      if (schritte > MAX_SUCHSCHRITTE) return false;
      const moeglich = haengeAn(aktuell, naechster);
      if (moeglich && weiter(naechster)) return true;
      nimmZurueck(aktuell, naechster);
    }
    return false;
  };
  return weiter(start) ? kreisAus(reihe) : null;
}

/**
 * Lost einen einzigen Kreis aus: jeder beschenkt genau einen anderen, niemand sich selbst,
 * (ab drei Teilnehmern) beschenken sich nie zwei gegenseitig, und niemand zieht jemanden,
 * den er nicht ziehen soll.
 *
 * Fisher-Yates mit kryptografischem Zufall, danach beschenkt jeder seinen Nachfolger in der
 * Reihe; verletzt der Kreis einen Ausschluss, wird neu gezogen. Damit ist jeder erlaubte
 * Kreis gleich wahrscheinlich (ohne Ausschlüsse passt schon der erste). Erst wenn nach
 * MAX_VERSUCHE keiner passt – bei sehr vielen Ausschlüssen –, sucht sucheKreis gezielt.
 * @param {string[]} ids - Teilnehmer-IDs (mindestens 3)
 * @param {object} [optionen]
 * @param {Map<string, Iterable<string>>} [optionen.ausschluesse] - geberId -> wen er nicht ziehen soll
 * @param {function(number): number} [optionen.randomInt] - liefert eine Zahl in [0, max)
 * @return {Object<string, string>|null} geberId -> empfaengerId; null, wenn die Ausschlüsse
 *     keinen Kreis zulassen
 */
function zieheKreis(ids, {ausschluesse, randomInt = crypto.randomInt} = {}) {
  if (!Array.isArray(ids) || ids.length < MIN_TEILNEHMER || new Set(ids).size !== ids.length) {
    throw new Error('zieheKreis braucht mindestens drei verschiedene IDs');
  }
  const gesperrt = sperrPruefung(ausschluesse);
  if (findeEngpass(ids, gesperrt)) return null;
  for (let versuch = 0; versuch < MAX_VERSUCHE; versuch++) {
    const reihe = mische(ids, randomInt);
    if (reihe.every((id, i) => !gesperrt(id, reihe[(i + 1) % reihe.length]))) return kreisAus(reihe);
  }
  return sucheKreis(ids, gesperrt, randomInt);
}

/**
 * E-Mail-Adresse aus der Eingabe, klein geschrieben; '' ohne Angabe.
 * @param {*} wert - Eingabe
 * @param {string} name - Teilnehmer, für die Fehlermeldung (die Adresse selbst steht nicht darin)
 * @param {function} HttpsError - Fehlerklasse
 * @return {string}
 */
function leseEmail(wert, name, HttpsError) {
  const email = typeof wert === 'string' ? wert.trim().toLowerCase() : '';
  if (email && (email.length > LAENGE.email || !EMAIL_MUSTER.test(email))) {
    throw new HttpsError('invalid-argument', `Die E-Mail-Adresse für „${name}“ sieht nicht gültig aus.`);
  }
  return email;
}

/**
 * Ein Eintrag aus `namen`:
 *  - Name (String): Teilnehmer ohne Gast (ältere App-Versionen)
 *  - {name, gastId, email?}: Gast aus der eigenen Gästeliste; `email` ergänzt eine dort fehlende Adresse
 *  - {vorname, nachname, email?} ohne gastId: neuer Gast, bekommt ein Gästeprofil (neuerGast)
 * @return {{name: string, gastId: string|null, email?: string, neuerGast?: {vorname: string, nachname: string}}|null}
 *   null ohne Namen
 */
function leseTeilnehmerEintrag(roh, HttpsError) {
  if (roh === null || typeof roh !== 'object') {
    const name = bereinige(roh, LAENGE.name);
    return name ? {name, gastId: null} : null;
  }
  const gastId = roh.gastId !== undefined && roh.gastId !== null ?
    pruefeId(roh.gastId, HttpsError, 'invalid-argument', 'Ungültige Gast-ID.') :
    null;
  if (!gastId && (roh.vorname !== undefined || roh.nachname !== undefined)) {
    const vorname = bereinige(roh.vorname, LAENGE.vorname);
    const nachname = bereinige(roh.nachname, LAENGE.nachname);
    if (!vorname || !nachname) throw new HttpsError('invalid-argument', 'Bitte gib Vor- und Nachnamen an.');
    const name = bereinige(`${vorname} ${nachname}`, LAENGE.name);
    const email = leseEmail(roh.email, name, HttpsError);
    return {name, gastId: null, ...(email ? {email} : {}), neuerGast: {vorname, nachname}};
  }
  const name = bereinige(roh.name, LAENGE.name);
  if (!name) return null;
  const email = gastId ? leseEmail(roh.email, name, HttpsError) : '';
  return {name, gastId, ...(email ? {email} : {})};
}

/**
 * Teilnehmer aus der Eingabe (Einträge siehe leseTeilnehmerEintrag). Bereinigt, ohne leere und
 * ohne doppelte Namen (Groß-/Kleinschreibung egal).
 * @param {*} namen - Liste der Einträge
 * @param {function} HttpsError - Fehlerklasse
 * @return {Array<{name: string, gastId: string|null, email?: string, neuerGast?: object}>}
 */
function leseNamen(namen, HttpsError) {
  if (!Array.isArray(namen)) throw new HttpsError('invalid-argument', 'namen muss eine Liste sein.');
  if (namen.length > MAX_TEILNEHMER) {
    throw new HttpsError('invalid-argument', `Höchstens ${MAX_TEILNEHMER} Teilnehmer pro Runde.`);
  }
  const gesehen = new Set();
  const ergebnis = [];
  namen.forEach((roh) => {
    const eintrag = leseTeilnehmerEintrag(roh, HttpsError);
    if (!eintrag || gesehen.has(schluessel(eintrag.name))) return;
    gesehen.add(schluessel(eintrag.name));
    ergebnis.push(eintrag);
  });
  return ergebnis;
}

/**
 * Text und Link eines neuen Eintrags. Einer von beiden genügt. Ohne eigenes Link-Feld
 * wird ein Link am Ende des Textes (eingefügter Link, Teilen-Text einer Shop-App) zum Link.
 * @param {object} daten - Eingabe mit text und url
 * @param {function} HttpsError - Fehlerklasse
 * @return {{text: string, url: string|null}}
 */
function leseEintrag(daten, HttpsError) {
  // Vor der Verarbeitung kappen: mehr braucht weder Text noch Link.
  const rohText = typeof daten.text === 'string' ? daten.text.slice(0, LAENGE.text + linkVorschau._internal.MAX_LINK) : '';
  const rohLink = typeof daten.url === 'string' ? daten.url.trim() : '';
  let text = rohText;
  let url;
  if (rohLink) {
    url = linkVorschau.normalisiereLink(rohLink);
    if (!url) {
      throw new HttpsError('invalid-argument', 'Der Link sieht nicht gültig aus. Bitte füge die ganze Adresse ein, z. B. https://…');
    }
  } else {
    ({text, url} = linkVorschau.trenneLinkAb(rohText));
  }
  text = bereinige(text, LAENGE.text);
  if (!text && !url) throw new HttpsError('invalid-argument', 'Bitte schreib etwas oder füge einen Link ein.');
  return {text, url};
}

/** Was von einem Eintrag nach außen geht: Text, Link und Vorschau. */
function eintragInhalt(e) {
  return {id: e.id, text: e.text || '', url: e.url || null, vorschau: e.vorschau || null};
}

function pruefeId(value, HttpsError, code = 'invalid-argument', message = 'Ungültige ID.') {
  if (typeof value !== 'string' || !ID_MUSTER.test(value)) throw new HttpsError(code, message);
  return value;
}

/**
 * Schreibt Änderungen in Batches (Firestore: höchstens 500 Schreibvorgänge pro Batch).
 * @param {object} db - Firestore
 * @param {Array<function(object): void>} schritte - je Schritt ein Schreibvorgang auf dem Batch
 * @return {Promise<void>}
 */
async function schreibeInBatches(db, schritte) {
  for (let i = 0; i < schritte.length; i += BATCH_GROESSE) {
    const batch = db.batch();
    schritte.slice(i, i + BATCH_GROESSE).forEach((schritt) => schritt(batch));
    await batch.commit();
  }
}

const rundenPfad = (rundeId) => `${COLLECTION}/${rundeId}`;
const teilnehmerPfad = (rundeId) => `${COLLECTION}/${rundeId}/teilnehmer`;
const zuordnungenPfad = (rundeId) => `${COLLECTION}/${rundeId}/zuordnungen`;
const eintraegePfad = (rundeId) => `${COLLECTION}/${rundeId}/eintraege`;

/**
 * Teilnehmer einer Runde in Anlegereihenfolge. Die Unter-Collection gehört genau zu
 * dieser Runde; das Limit begrenzt den Lesevorgang auf die erlaubte Höchstzahl.
 * @param {object} db - Firestore
 * @param {string} rundeId - Runde
 * @return {Promise<Array<object>>}
 */
async function ladeTeilnehmer(db, rundeId) {
  const snap = await db.collection(teilnehmerPfad(rundeId)).limit(MAX_TEILNEHMER).get();
  return snap.docs
      .map((doc) => ({id: doc.id, ...doc.data()}))
      .sort((a, b) => (a.reihenfolge || 0) - (b.reihenfolge || 0));
}

async function ladeEintraege(db, rundeId, feld, wert, limit) {
  const snap = await db.collection(eintraegePfad(rundeId)).where(feld, '==', wert).limit(limit).get();
  return snap.docs.map((doc) => ({id: doc.id, ref: doc.ref, ...doc.data()})).sort(nachErstellung);
}

/**
 * Wen ein Teilnehmer nicht ziehen soll: nur andere, noch vorhandene Teilnehmer, ohne Doppelte.
 * @param {{id: string, ausschluesse?: *}} t - Teilnehmer (ältere ohne Feld: keine Ausschlüsse)
 * @param {Set<string>} ids - IDs aller Teilnehmer der Runde
 * @return {string[]}
 */
function ausschluesseVon(t, ids) {
  const liste = Array.isArray(t.ausschluesse) ? t.ausschluesse : [];
  return [...new Set(liste)].filter((id) => id !== t.id && ids.has(id));
}

/** @return {Map<string, string[]>} teilnehmerId -> wen er nicht ziehen soll */
function ausschlussKarte(teilnehmer) {
  const ids = new Set(teilnehmer.map((t) => t.id));
  return new Map(teilnehmer.map((t) => [t.id, ausschluesseVon(t, ids)]));
}

/** Warum die Auslosung mit diesen Ausschlüssen nicht aufgeht – möglichst mit Namen. */
function meldungOhneKreis(teilnehmer, ausschluesse) {
  const engpass = findeEngpass(teilnehmer.map((t) => t.id), sperrPruefung(ausschluesse));
  const name = engpass ? teilnehmer.find((t) => t.id === engpass.id)?.name : null;
  if (name && engpass.art === 'schenkt') {
    return `Für „${name}“ sind alle anderen ausgeschlossen – so bliebe niemand zum Beschenken. Nimm dort mindestens einen Ausschluss zurück.`;
  }
  if (name) {
    return `„${name}“ ist bei allen anderen ausgeschlossen – so würde niemand „${name}“ beschenken. Nimm mindestens einen dieser Ausschlüsse zurück.`;
  }
  return 'Mit diesen Ausschlüssen ließ sich keine Auslosung finden. Nimm einen oder mehrere Ausschlüsse zurück.';
}

// ---------------------------------------------------------------------------
// Organisator
// ---------------------------------------------------------------------------

/**
 * Nur angemeldete Mitglieder ab Rolle edit dürfen Runden verwalten. Schlägt geschlossen
 * fehl, wenn die Rolle nicht gelesen werden kann.
 * @return {Promise<{uid: string, vorname: string|null}>} Organisator (Vorname für Mails)
 */
async function pruefeOrganisator(db, HttpsError, auth) {
  if (!auth || !auth.uid) throw new HttpsError('unauthenticated', 'Bitte melde dich an.');
  if (auth.token?.firebase?.sign_in_provider === 'anonymous') {
    throw new HttpsError('permission-denied', 'Wichtel-Runden können nur Mitglieder anlegen.');
  }
  let nutzer;
  try {
    const snap = await db.doc(`users/${auth.uid}`).get();
    nutzer = snap.exists ? snap.data() : null;
  } catch (err) {
    console.error(`wichtelVerwalten: Rolle von ${auth.uid} nicht lesbar:`, err);
    throw new HttpsError('unavailable', 'Deine Berechtigung konnte nicht geprüft werden. Bitte versuche es gleich noch einmal.');
  }
  if (!ORGANISATOR_ROLLEN.has(nutzer?.role)) {
    throw new HttpsError('permission-denied', 'Wichtel-Runden verwalten können nur Mitglieder mit Bearbeiten-Recht.');
  }
  return {uid: auth.uid, vorname: bereinige(nutzer.vorname, LAENGE.name) || null};
}

/** Fremde und gelöschte Runden sehen gleich aus: nicht gefunden. */
async function ladeEigeneRunde(db, HttpsError, uid, rundeId) {
  pruefeId(rundeId, HttpsError, 'not-found', RUNDE_FEHLT);
  const ref = db.doc(rundenPfad(rundeId));
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.ownerId !== uid) throw new HttpsError('not-found', RUNDE_FEHLT);
  return {ref, runde: snap.data()};
}

/**
 * @param {*} wert - Eingabe oder gespeicherter Wert
 * @return {boolean} ob `wert` ein Kalendertag 'JJJJ-MM-TT' zwischen DATUM_JAHRE.von und .bis ist
 */
function istDatum(wert) {
  const treffer = typeof wert === 'string' ? wert.match(DATUM_MUSTER) : null;
  if (!treffer) return false;
  const [jahr, monat, tag] = treffer.slice(1).map(Number);
  const tagDatum = new Date(Date.UTC(jahr, monat - 1, tag));
  return jahr >= DATUM_JAHRE.von && jahr <= DATUM_JAHRE.bis &&
    tagDatum.getUTCMonth() === monat - 1 && tagDatum.getUTCDate() === tag;
}

/** @return {string} Datum der Feier einer Runde oder '' (keins; ältere Runden haben kein Feld) */
const feierDatum = (runde) => (istDatum(runde?.datum) ? runde.datum : '');

/** @return {string} Kalendertag `tage` Tage vor oder nach `datum` ('JJJJ-MM-TT') */
function verschiebeTag(datum, tage) {
  const [jahr, monat, tag] = datum.split('-').map(Number);
  return new Date(Date.UTC(jahr, monat - 1, tag + tage)).toISOString().slice(0, 10);
}

/**
 * Datum der Feier aus der Eingabe: '' oder null löscht es, sonst muss es ein gültiger Kalendertag sein.
 * @return {string}
 */
function leseDatum(wert, HttpsError) {
  if (wert === null || wert === '') return '';
  if (!istDatum(wert)) throw new HttpsError('invalid-argument', 'Bitte gib ein gültiges Datum für die Feier an.');
  return wert;
}

function rundenKopf(rundeId, runde, teilnehmerAnzahl) {
  return {
    id: rundeId,
    titel: runde.titel || '',
    anlass: ANLAESSE.has(runde.anlass) ? runde.anlass : '',
    budget: runde.budget || '',
    hinweis: runde.hinweis || '',
    datum: feierDatum(runde),
    status: runde.status === 'ausgelost' ? 'ausgelost' : 'offen',
    teilnehmerAnzahl: typeof teilnehmerAnzahl === 'number' ? teilnehmerAnzahl : (runde.teilnehmerAnzahl || 0),
    erstelltAm: millis(runde.erstelltAm),
    ausgelostAm: millis(runde.ausgelostAm),
  };
}

/**
 * Was der Organisator sieht: Runde, Teilnehmer mit Link-Token, Status, Ausschlüssen,
 * verknüpftem Gast und Ergebnis der letzten Mail. Bewusst ohne Zuordnungen und ohne Einträge –
 * und ohne Erinnerungen: Wer erinnert wird, hat noch keinen Wunsch, und Wünsche sieht der
 * Organisator nicht. `geladen`: schon gelesene Teilnehmer (spart den zweiten Lesevorgang).
 */
async function organisatorSicht(db, rundeId, runde, geladen = null) {
  const teilnehmer = geladen || await ladeTeilnehmer(db, rundeId);
  const ausschluesse = ausschlussKarte(teilnehmer);
  return {
    runde: rundenKopf(rundeId, runde, teilnehmer.length),
    teilnehmer: teilnehmer.map((t) => ({
      id: t.id,
      name: t.name,
      token: t.token,
      geoeffnet: Boolean(t.geoeffnetAm),
      gezogen: Boolean(t.gezogenAm),
      gekauft: Boolean(t.geschenkGekauftAm),
      ausschluesse: ausschluesse.get(t.id),
      gastId: t.gastId || null,
      mail: MAIL_STATUS.has(t.mailStatus) ? {status: t.mailStatus, am: millis(t.mailAm)} : null,
    })),
  };
}

/**
 * Felder der Runde aus der Eingabe. `datum` nur, wenn mitgeschickt: Speichert eine ältere
 * App-Version ohne das Feld, bleibt ein gesetztes Datum erhalten.
 */
function leseRundenFelder(daten, HttpsError) {
  const titel = bereinige(daten.titel, LAENGE.titel);
  if (!titel) throw new HttpsError('invalid-argument', 'Bitte gib der Runde einen Titel.');
  return {
    titel,
    anlass: ANLAESSE.has(daten.anlass) ? daten.anlass : '',
    budget: bereinige(daten.budget, LAENGE.budget),
    hinweis: bereinige(daten.hinweis, LAENGE.hinweis),
    ...(daten.datum === undefined ? {} : {datum: leseDatum(daten.datum, HttpsError)}),
  };
}

/** Ab dem Tag der Feier (Berliner Zeit) keine Neuigkeiten-Mails mehr. */
const feierErreicht = (runde, jetztMs) => Boolean(feierDatum(runde)) && berlinerTag(jetztMs) >= feierDatum(runde);

/** Weniger als ERINNERUNG_VORLAUF_TAGE bis zur Feier (oder schon vorbei): keine Erinnerung mehr. */
const zuSpaetFuerErinnerung = (runde, jetztMs) => Boolean(feierDatum(runde)) &&
  berlinerTag(jetztMs) > verschiebeTag(feierDatum(runde), -ERINNERUNG_VORLAUF_TAGE);

function pruefeOffen(runde, HttpsError, was = 'Teilnehmer') {
  if (runde.status === 'ausgelost') {
    throw new HttpsError('failed-precondition', `Die Runde ist schon ausgelost. Setze die Auslosung zurück, um ${was} zu ändern.`);
  }
}

// ---------------------------------------------------------------------------
// Einladung per Mail
// ---------------------------------------------------------------------------

/** @return {string} persönlicher Link wie buildWichtelLink in src/utils/wichtelLinks.js */
function wichtelLink(rundeId, token) {
  return `${APP_URL}/wichteln/${rundeId}/${token}`;
}

/** Gästeliste eines Mitglieds (Gästeprofile, sonst nur über manageGuestProfile.js geschrieben). */
const gaesteProfilePfad = (uid) => `guests/${uid}/profiles`;

/**
 * Gäste zu den IDs aus der eigenen Gästeliste des Organisators. Fremde und gelöschte Gäste
 * fehlen in der Antwort; nur dieser Pfad wird gelesen, nie die Gästeliste eines anderen.
 * @param {object} db - Firestore
 * @param {string} uid - Organisator
 * @param {Array<string|null>} gastIds - geprüfte IDs (pruefeId)
 * @return {Promise<Map<string, {email: string|null, gespeichert: string, sprache: string}>>}
 *   email: Adresse, an die eine Mail gehen darf (sonst null); gespeichert: was im Profil steht ('' = keine)
 */
async function ladeGaeste(db, uid, gastIds) {
  const ids = [...new Set(gastIds.filter(Boolean))];
  const snaps = await Promise.all(ids.map((id) => db.doc(`${gaesteProfilePfad(uid)}/${id}`).get()));
  const gaeste = new Map();
  snaps.forEach((snap, i) => {
    if (!snap.exists) return;
    const daten = snap.data() || {};
    const email = typeof daten.email === 'string' ? daten.email.trim().toLowerCase() : '';
    gaeste.set(ids[i], {
      email: EMAIL_MUSTER.test(email) ? email : null,
      gespeichert: email,
      sprache: normalisiereSprache(daten.sprache),
    });
  });
  return gaeste;
}

/**
 * Gästeprofil für einen neu eingetragenen Teilnehmer: Name und Adresse wie eingegeben, alles andere
 * wie ein leeres Formular unter „Gäste verwalten“ (emptyForm in src/components/GuestManagementPage.js).
 * Ein Test prüft, dass validateProfile in manageGuestProfile.js es unverändert annimmt.
 * @param {{vorname: string, nachname: string, email: string}} gast - geprüfte Eingabe
 * @return {object} Felder ohne id und Zeitstempel
 */
function neuesGastprofil({vorname, nachname, email}) {
  return {
    vorname,
    nachname,
    email,
    kind: false,
    alkoholischeGetränke: true,
    bevorzugteGetränke: [],
    bevorzugteKategorien: [],
    präferenzFaktor: 0.5,
    sprache: STANDARD_SPRACHE,
  };
}

/** Berliner Kalendertag als YYYY-MM-DD. */
function berlinerTag(ms) {
  return new Date(ms).toLocaleDateString('sv-SE', {timeZone: 'Europe/Berlin'});
}

/**
 * Reserviert bis zu `anzahl` Mails im Tageslimit des Organisators.
 * @return {Promise<number>} wie viele verschickt werden dürfen (0 bis anzahl)
 */
async function reserviereMails(db, uid, anzahl, jetztMs) {
  const tag = berlinerTag(jetztMs);
  const ref = db.doc(`${MAIL_LIMIT_COLLECTION}/${uid}_${tag}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const bisher = snap.exists ? (snap.data().anzahl || 0) : 0;
    const erlaubt = Math.max(0, Math.min(anzahl, MAX_MAILS_PRO_TAG - bisher));
    if (erlaubt > 0) tx.set(ref, {uid, tag, anzahl: bisher + erlaubt});
    return erlaubt;
  });
}

/** Antwortfeld `versand`, wenn keine Mail rausgehen sollte. */
function keinVersand() {
  return {gesendet: 0, fehlgeschlagen: 0, grund: null};
}

/** Nur Codes, nie die Meldung: die Antwort des SMTP-Servers kann die Adresse enthalten (S26). */
function mailFehlerCode(err) {
  return [err?.code, err?.responseCode, err?.command].filter(Boolean).join(' ') || 'unbekannt';
}

const erinnerungPfad = (rundeId, teilnehmerId) => `${ERINNERUNGEN_COLLECTION}/${rundeId}_${teilnehmerId}`;

/** Vormerker einer Erinnerung (ohne Zuordnung, ohne Adresse). */
function erinnerungsVormerker(admin, rundeId, teilnehmerId, faelligMs) {
  return {rundeId, teilnehmerId, faelligAm: admin.firestore.Timestamp.fromMillis(faelligMs), fehlversuche: 0};
}

/**
 * Verschickt die persönlichen Links an Teilnehmer, deren Gast eine E-Mail-Adresse hat, und
 * merkt sich je Teilnehmer das Ergebnis (mailStatus, mailAm). Wirft nicht: Was nicht
 * rausging, steht als 'fehler' am Teilnehmer und in der Antwort (grund). Jede zugestellte
 * Einladung merkt die erste Erinnerung vor (ERINNERUNG_NACH_MS ab jetzt, auch beim erneuten
 * Senden); ob sie nötig ist, prüft erst der Versand.
 * @param {object} ctx - {admin, db, uid, organisatorName, mailer, jetztMs}
 * @param {string} rundeId - Runde
 * @param {object} runde - Rundendaten (titel, anlass, budget, hinweis)
 * @param {Array<{id: string, name: string, token: string, gast: {email: string, sprache: string}}>} empfaenger
 * @return {Promise<{gesendet: number, fehlgeschlagen: number, grund: string|null}>} grund:
 *   'nicht-eingerichtet' (kein SMTP), 'limit' (Tageslimit) oder 'fehler'
 */
async function versendeEinladungen(ctx, rundeId, runde, empfaenger) {
  const {admin, db, uid} = ctx;
  const ergebnis = keinVersand();
  if (empfaenger.length === 0) return ergebnis;

  const jetztMs = ctx.jetztMs ?? Date.now();
  const transport = typeof ctx.mailer === 'function' ? ctx.mailer() : null;
  let erlaubt = 0;
  if (!transport) {
    ergebnis.grund = 'nicht-eingerichtet';
  } else {
    try {
      erlaubt = await reserviereMails(db, uid, empfaenger.length, jetztMs);
      if (erlaubt < empfaenger.length) ergebnis.grund = 'limit';
    } catch (err) {
      // Schlägt geschlossen fehl: ohne prüfbares Limit geht keine Mail raus.
      console.error(`wichtelVerwalten: Mail-Limit von ${uid} nicht prüfbar:`, mailFehlerCode(err));
      ergebnis.grund = 'fehler';
    }
  }

  const zuSenden = empfaenger.slice(0, erlaubt);
  const status = new Map(empfaenger.slice(erlaubt).map((t) => [t.id, 'fehler']));
  try {
    const versuche = await Promise.allSettled(zuSenden.map((t) => transport.senden({
      to: t.gast.email,
      ...baueEinladungsMail({
        sprache: t.gast.sprache,
        anlass: runde.anlass,
        name: t.name,
        titel: runde.titel || '',
        budget: runde.budget || '',
        hinweis: runde.hinweis || '',
        datum: feierDatum(runde),
        organisator: ctx.organisatorName,
        link: wichtelLink(rundeId, t.token),
      }),
    })));
    versuche.forEach((versuch, i) => {
      const t = zuSenden[i];
      if (versuch.status === 'fulfilled') {
        status.set(t.id, 'gesendet');
        return;
      }
      status.set(t.id, 'fehler');
      ergebnis.grund = ergebnis.grund || 'fehler';
      console.error(`wichtelVerwalten: Mail an Teilnehmer ${t.id} (Runde ${rundeId}) fehlgeschlagen:`,
          mailFehlerCode(versuch.reason));
    });
  } finally {
    if (transport && typeof transport.schliessen === 'function') transport.schliessen();
  }

  const jetzt = admin.firestore.FieldValue.serverTimestamp();
  const erinnerungMs = jetztMs + ERINNERUNG_NACH_MS;
  await schreibeInBatches(db, [...status].flatMap(([id, mailStatus]) => [
    (batch) => batch.update(db.doc(`${teilnehmerPfad(rundeId)}/${id}`), {mailStatus, mailAm: jetzt}),
    ...(mailStatus === 'gesendet' ?
      [(batch) => batch.set(db.doc(erinnerungPfad(rundeId, id)), erinnerungsVormerker(admin, rundeId, id, erinnerungMs))] :
      []),
  ]));
  status.forEach((mailStatus) => {
    if (mailStatus === 'gesendet') ergebnis.gesendet += 1;
    else ergebnis.fehlgeschlagen += 1;
  });
  return ergebnis;
}

/**
 * Legt Teilnehmer an (Gast-Verknüpfung nur zu Gästen aus der eigenen Gästeliste). Für einen neuen
 * Gast (Vor- und Nachname) entsteht in der Gästeliste ein Gästeprofil, im selben Batch wie der
 * Teilnehmer; einem vorhandenen Gast ohne Adresse wird die mitgeschickte eingetragen, eine andere
 * gespeicherte überschreibt die Runde nicht. Mails gehen hier keine raus – die Einladung folgt
 * beim Auslosen (ladeZurAuslosungEin).
 * @param {object} ctx - Aufrufkontext (admin, db, HttpsError, uid, ...)
 * @param {object} rundeRef - Runde
 * @param {string} rundeId - Runde
 * @param {Array<{name: string, gastId: string|null, email?: string, neuerGast?: object}>} eintraege - aus leseNamen
 * @return {Promise<void>}
 */
async function nimmTeilnehmerAuf(ctx, rundeRef, rundeId, eintraege) {
  const {admin, db, HttpsError, uid} = ctx;
  const vorhanden = await ladeTeilnehmer(db, rundeId);
  const belegt = new Set(vorhanden.map((t) => schluessel(String(t.name))));
  const doppelt = eintraege.find((e) => belegt.has(schluessel(e.name)));
  if (doppelt) throw new HttpsError('already-exists', `„${doppelt.name}“ ist schon dabei.`);
  if (vorhanden.length + eintraege.length > MAX_TEILNEHMER) {
    throw new HttpsError('invalid-argument', `Höchstens ${MAX_TEILNEHMER} Teilnehmer pro Runde.`);
  }
  // Ein Gast nur einmal je Runde (auch unter anderem Namen): sonst zwei Links und zwei Mails.
  const verknuepft = new Map(vorhanden.filter((t) => t.gastId).map((t) => [t.gastId, t.name]));
  eintraege.forEach((e) => {
    if (!e.gastId) return;
    if (verknuepft.has(e.gastId)) {
      throw new HttpsError('already-exists', `„${e.name}“ ist schon als „${verknuepft.get(e.gastId)}“ dabei.`);
    }
    verknuepft.set(e.gastId, e.name);
  });
  const gaeste = await ladeGaeste(db, uid, eintraege.map((e) => e.gastId));
  // Adresse zu einem Gast aus der Gästeliste: ergänzt eine fehlende; eine andere gespeicherte
  // bleibt – die pflegt der Organisator unter „Gäste verwalten“.
  const adresseErgaenzen = eintraege.filter((e) => {
    const gast = e.email ? gaeste.get(e.gastId) : null;
    if (!gast || gast.gespeichert === e.email) return false;
    if (gast.gespeichert) {
      throw new HttpsError('failed-precondition',
          `„${e.name}“ steht in deiner Gästeliste mit einer anderen E-Mail-Adresse. Ändern kannst du sie unter „Gäste verwalten“.`);
    }
    return true;
  });
  const jetzt = admin.firestore.FieldValue.serverTimestamp();
  const start = vorhanden.reduce((max, t) => Math.max(max, t.reihenfolge || 0), 0);
  const sammlung = db.collection(teilnehmerPfad(rundeId));
  const profile = db.collection(gaesteProfilePfad(uid));
  const neue = eintraege.map((e, i) => {
    const profilRef = e.neuerGast ? profile.doc() : null;
    return {
      ref: sammlung.doc(),
      name: e.name,
      token: neuesToken(),
      gastId: profilRef ? profilRef.id : (gaeste.has(e.gastId) ? e.gastId : null),
      reihenfolge: start + i + 1,
      profil: profilRef ? {ref: profilRef, felder: neuesGastprofil({...e.neuerGast, email: e.email || ''})} : null,
    };
  });
  // Felder wie bei manageGuestProfile.js (create), damit „Gäste verwalten“ das Profil wie jedes andere zeigt.
  const schritte = neue.filter((t) => t.profil).map(({profil}) => (batch) => batch.set(profil.ref, {
    id: profil.ref.id,
    ...profil.felder,
    erstellt: jetzt,
    aktualisiert: jetzt,
    erstelltVon: uid,
  }));
  adresseErgaenzen.forEach((e) => schritte.push((batch) => batch.update(
      db.doc(`${gaesteProfilePfad(uid)}/${e.gastId}`), {email: e.email, aktualisiert: jetzt})));
  neue.forEach((t) => schritte.push((batch) => batch.set(t.ref, {
    name: t.name,
    token: t.token,
    gastId: t.gastId,
    reihenfolge: t.reihenfolge,
    ausschluesse: [],
    geoeffnetAm: null,
    gezogenAm: null,
    geschenkGekauftAm: null,
    mailStatus: null,
    mailAm: null,
    // Zähler der Erinnerungen; fehlt nur bei Teilnehmern von vor der Erinnerungs-Mail
    // (Übergang in planeErinnerungen).
    erinnerungen: 0,
    erstelltAm: jetzt,
  })));
  schritte.push((batch) => batch.update(rundeRef, {
    teilnehmerAnzahl: vorhanden.length + neue.length,
    aktualisiertAm: jetzt,
  }));
  // Bis MAX_TEILNEHMER Teilnehmer samt Gästeprofilen passt das in einen Batch: alles oder nichts.
  await schreibeInBatches(db, schritte);
}

/**
 * Die erste Mail einer Runde: Nach dem Auslosen bekommt jeder Teilnehmer, dessen Gast eine
 * E-Mail-Adresse hat (frisch aus der Gästeliste), seinen Link – außer, er hat schon eine
 * zugestellte Einladung (neues Auslosen nach dem Zurücksetzen, Runden von vor dieser Regel).
 * Wirft nicht: Die Auslosung steht schon, ein Fehler beim Versand steht in der Antwort.
 * @param {object} ctx - Aufrufkontext (admin, db, uid, organisatorName, mailer, jetztMs)
 * @param {string} rundeId - Runde
 * @param {object} runde - Rundendaten (für die Mail)
 * @param {Array<object>} teilnehmer - aus ladeTeilnehmer
 * @return {Promise<{gesendet: number, fehlgeschlagen: number, grund: string|null}>}
 */
async function ladeZurAuslosungEin(ctx, rundeId, runde, teilnehmer) {
  const offen = teilnehmer.filter((t) => t.gastId && t.mailStatus !== 'gesendet');
  if (offen.length === 0) return keinVersand();
  let empfaenger = null;
  try {
    const gaeste = await ladeGaeste(ctx.db, ctx.uid, offen.map((t) => t.gastId));
    empfaenger = offen
        .filter((t) => gaeste.get(t.gastId)?.email)
        .map((t) => ({id: t.id, name: t.name, token: t.token, gast: gaeste.get(t.gastId)}));
    return await versendeEinladungen(ctx, rundeId, runde, empfaenger);
  } catch (err) {
    console.error(`wichtelVerwalten: Einladungen zur Auslosung (Runde ${rundeId}) nicht verschickt:`, mailFehlerCode(err));
    // Ohne gelesene Gästeliste ist offen, wer eine Adresse hat: dann zählen alle Verknüpften.
    return {gesendet: 0, fehlgeschlagen: (empfaenger || offen).length, grund: 'fehler'};
  }
}

// ---------------------------------------------------------------------------
// Neuigkeiten per Mail (an den Schenker)
// ---------------------------------------------------------------------------

/** Wer Neuigkeiten bekommt: Los gezogen, Geschenk nicht als gekauft markiert, Gast verknüpft. */
function bekommtNeuigkeiten(geber) {
  return Boolean(geber.gezogenAm) && !geber.geschenkGekauftAm && Boolean(geber.gastId);
}

const vormerkerPfad = (rundeId, geberId) => `${NEUIGKEITEN_COLLECTION}/${rundeId}_${geberId}`;

/**
 * Merkt nach einem neuen Eintrag über `ueberId` eine Neuigkeiten-Mail an dessen Schenker vor:
 * ein Wunsch von `ueberId` selbst oder eine Idee eines anderen Gasts. Eigene Ideen des Schenkers
 * lösen nichts aus. Kommen vor dem Versand weitere Einträge dazu, bleibt der Termin; der
 * Vormerker zählt nur hoch (`zaehler`), damit der Versand Einträge erkennt, die während des
 * Sendens dazukamen. Wirft nicht: am Vormerken soll das Speichern des Eintrags nicht scheitern.
 * @param {object} admin - firebase-admin (Timestamp)
 * @param {object} db - Firestore
 * @param {{rundeId: string, runde: object, autorId: string, ueberId: string, jetztMs: number}} eintrag
 * @return {Promise<void>}
 */
async function merkeNeuigkeitVor(admin, db, {rundeId, runde, autorId, ueberId, jetztMs}) {
  if (runde.status !== 'ausgelost' || feierErreicht(runde, jetztMs)) return;
  try {
    const zuordnung = await db.collection(zuordnungenPfad(rundeId))
        .where('empfaengerId', '==', ueberId).limit(1).get();
    if (zuordnung.empty) return;
    const geberId = zuordnung.docs[0].id;
    if (geberId === autorId) return;
    const geberSnap = await db.doc(`${teilnehmerPfad(rundeId)}/${geberId}`).get();
    const geber = geberSnap.exists ? geberSnap.data() : null;
    if (!geber || !bekommtNeuigkeiten(geber)) return;
    const gast = (await ladeGaeste(db, runde.ownerId, [geber.gastId])).get(geber.gastId);
    if (!gast?.email) return;
    const ref = db.doc(vormerkerPfad(rundeId, geberId));
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        tx.update(ref, {zaehler: (snap.data().zaehler || 0) + 1});
        return;
      }
      const letzteMail = millis(geber.neuigkeitenMailAm);
      const faellig = Math.max(jetztMs + SAMMELFENSTER_MS, letzteMail === null ? 0 : letzteMail + MINDESTABSTAND_MS);
      tx.set(ref, {
        rundeId,
        geberId,
        faelligAm: admin.firestore.Timestamp.fromMillis(faellig),
        zaehler: 1,
        fehlversuche: 0,
      });
    });
  } catch (err) {
    console.error(`wichtelTeilnahme: Neuigkeit in Runde ${rundeId} nicht vorgemerkt:`, err);
  }
}

/**
 * Vormerker einer Runde löschen: Neuigkeiten, wenn die Runde gelöscht oder die Auslosung
 * zurückgesetzt wird, Erinnerungen nur mit der Runde (Wünsche bleiben beim Zurücksetzen).
 */
async function loescheVormerker(db, rundeId, collection = NEUIGKEITEN_COLLECTION) {
  const snap = await db.collection(collection).where('rundeId', '==', rundeId).limit(MAX_TEILNEHMER).get();
  await schreibeInBatches(db, snap.docs.map((doc) => (batch) => batch.delete(doc.ref)));
}

/**
 * Schließt einen Vormerker ab: löschen, außer seit dem Lesen kamen Einträge dazu (zaehler
 * gestiegen). Dann bleibt er mit neuem Termin liegen, und die neuen Einträge gehen mit der
 * nächsten Mail raus.
 * @param {object} ctx - {admin, db}
 * @param {object} doc - gelesener Vormerker
 * @param {number} gelesen - `zaehler` beim Lesen
 * @param {number} nochmalAmMs - Termin, falls Einträge dazukamen
 * @return {Promise<void>}
 */
async function schliesseVormerkerAb({admin, db}, doc, gelesen, nochmalAmMs) {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(doc.ref);
    if (!snap.exists) return;
    if ((snap.data().zaehler || 0) === gelesen) {
      tx.delete(doc.ref);
    } else {
      tx.update(doc.ref, {faelligAm: admin.firestore.Timestamp.fromMillis(nochmalAmMs), fehlversuche: 0});
    }
  });
}

/**
 * Neuer Versuch in NEUER_VERSUCH_MS. Ein gescheiterter Versand zählt als Fehlversuch; nach
 * MAX_FEHLVERSUCHE wird der Vormerker verworfen.
 * @return {Promise<'verschoben'|'verworfen'>}
 */
async function verschiebeVormerker({admin, jetztMs, name}, doc, {fehlversuch}) {
  const fehlversuche = (doc.data().fehlversuche || 0) + (fehlversuch ? 1 : 0);
  if (fehlversuche >= MAX_FEHLVERSUCHE) {
    console.error(`${name}: Vormerker ${doc.id} nach ${fehlversuche} Fehlversuchen verworfen`);
    await doc.ref.delete();
    return 'verworfen';
  }
  await doc.ref.update({
    faelligAm: admin.firestore.Timestamp.fromMillis(jetztMs + NEUER_VERSUCH_MS),
    fehlversuche,
  });
  return 'verschoben';
}

/**
 * Ein fälliger Vormerker: prüft alles erneut (Runde ausgelost, Los gezogen, nicht gekauft,
 * Zuordnung, Adresse frisch aus dem Gästeprofil), zählt die Einträge über den Empfänger seit
 * der letzten Mail (ohne eigene des Schenkers) und verschickt die Mail.
 * @param {object} ctx - {admin, db, jetztMs, transport, name}
 * @param {object} doc - Vormerker aus der Abfrage
 * @return {Promise<'gesendet'|'verworfen'|'verschoben'>}
 */
async function bearbeiteNeuigkeit(ctx, doc) {
  const {admin, db, jetztMs, transport} = ctx;
  const {rundeId, geberId, zaehler = 0} = doc.data();
  const verwerfen = async () => {
    await schliesseVormerkerAb(ctx, doc, zaehler, jetztMs + SAMMELFENSTER_MS);
    return 'verworfen';
  };
  if (typeof rundeId !== 'string' || !ID_MUSTER.test(rundeId) ||
      typeof geberId !== 'string' || !ID_MUSTER.test(geberId)) {
    return verwerfen();
  }
  const geberRef = db.doc(`${teilnehmerPfad(rundeId)}/${geberId}`);
  const [rundeSnap, geberSnap, zuordnungSnap] = await Promise.all([
    db.doc(rundenPfad(rundeId)).get(),
    geberRef.get(),
    db.doc(`${zuordnungenPfad(rundeId)}/${geberId}`).get(),
  ]);
  const runde = rundeSnap.exists ? rundeSnap.data() : null;
  const geber = geberSnap.exists ? geberSnap.data() : null;
  const empfaengerId = zuordnungSnap.exists ? zuordnungSnap.data().empfaengerId : null;
  if (!runde || runde.status !== 'ausgelost' || feierErreicht(runde, jetztMs) || !geber ||
      !bekommtNeuigkeiten(geber) || !empfaengerId) {
    return verwerfen();
  }

  // Neu ist, was nach dem Ziehen und nach dem letzten gemeldeten Eintrag entstand.
  const seit = Math.max(millis(geber.gezogenAm) ?? 0, millis(geber.neuigkeitenBis) ?? 0);
  const neu = (await ladeEintraege(db, rundeId, 'ueberId', empfaengerId, MAX_EINTRAEGE_UEBER))
      .filter((e) => e.autorId !== geberId && (millis(e.erstelltAm) ?? 0) > seit);
  if (neu.length === 0) return verwerfen();
  const gast = (await ladeGaeste(db, runde.ownerId, [geber.gastId])).get(geber.gastId);
  if (!gast?.email) return verwerfen();

  let erlaubt = 0;
  try {
    erlaubt = await reserviereMails(db, runde.ownerId, 1, jetztMs);
  } catch (err) {
    // Schlägt geschlossen fehl: ohne prüfbares Limit geht keine Mail raus.
    console.error(`wichtelNeuigkeitenVersenden: Mail-Limit von ${runde.ownerId} nicht prüfbar:`, mailFehlerCode(err));
  }
  if (erlaubt < 1) return verschiebeVormerker(ctx, doc, {fehlversuch: false});

  const wuensche = neu.filter((e) => e.autorId === empfaengerId).length;
  const link = wichtelLink(rundeId, geber.token);
  try {
    await transport.senden({
      to: gast.email,
      ...baueNeuigkeitenMail({
        sprache: gast.sprache,
        anlass: runde.anlass,
        name: geber.name,
        titel: runde.titel || '',
        budget: runde.budget || '',
        hinweis: runde.hinweis || '',
        datum: feierDatum(runde),
        link,
        linkGekauft: `${link}?${GEKAUFT_PARAMETER}`,
        wuensche,
        ideen: neu.length - wuensche,
      }),
    });
  } catch (err) {
    console.error(`wichtelNeuigkeitenVersenden: Mail an Teilnehmer ${geberId} (Runde ${rundeId}) fehlgeschlagen:`,
        mailFehlerCode(err));
    return verschiebeVormerker(ctx, doc, {fehlversuch: true});
  }

  // Erst den Stand des Schenkers, dann den Vormerker: scheitert Letzteres, findet der nächste
  // Lauf nichts Neues und verwirft ihn, statt dieselben Neuigkeiten noch einmal zu schicken.
  await geberRef.update({
    neuigkeitenMailAm: admin.firestore.FieldValue.serverTimestamp(),
    neuigkeitenBis: neu[neu.length - 1].erstelltAm,
  });
  await schliesseVormerkerAb(ctx, doc, zaehler, jetztMs + MINDESTABSTAND_MS);
  return 'gesendet';
}

/**
 * Ein Lauf einer geplanten Function: arbeitet fällige Vormerker einer Collection ab, älteste
 * zuerst. Ohne eingerichteten Mailversand bleiben sie liegen und werden eine Stunde später
 * erneut versucht; ohne Fälliges entsteht kein Mailer (die SMTP-Secrets bleiben ungelesen).
 * @param {object} admin - firebase-admin (FieldValue, Timestamp)
 * @param {object} db - Firestore
 * @param {{collection: string, bearbeite: function(object, object): Promise<string>,
 *   name: string, mailer: function, jetztMs: number}} params - bearbeite: ein Vormerker →
 *   'gesendet'|'verworfen'|'verschoben'; name: Function-Name für die Logs
 * @return {Promise<{gesendet: number, verworfen: number, verschoben: number}>}
 */
async function arbeiteVormerkerAb(admin, db, {collection, bearbeite, name, mailer, jetztMs}) {
  const ergebnis = {gesendet: 0, verworfen: 0, verschoben: 0};
  const faellig = await db.collection(collection)
      .where('faelligAm', '<=', admin.firestore.Timestamp.fromMillis(jetztMs))
      .orderBy('faelligAm')
      .limit(MAX_VORMERKER_PRO_LAUF)
      .get();
  if (faellig.empty) return ergebnis;

  const transport = typeof mailer === 'function' ? mailer() : null;
  const ctx = {admin, db, jetztMs, transport, name};
  try {
    for (const doc of faellig.docs) {
      let status;
      try {
        status = transport ?
          await bearbeite(ctx, doc) :
          await verschiebeVormerker(ctx, doc, {fehlversuch: false});
      } catch (err) {
        console.error(`${name}: Vormerker ${doc.id} nicht bearbeitet:`, err);
        status = await verschiebeVormerker(ctx, doc, {fehlversuch: true}).catch(() => 'verschoben');
      }
      ergebnis[status] += 1;
    }
  } finally {
    if (transport && typeof transport.schliessen === 'function') transport.schliessen();
  }
  return ergebnis;
}

/**
 * Ein Lauf der geplanten Function wichtelNeuigkeitenVersenden: verschickt fällige
 * Neuigkeiten-Mails (bearbeiteNeuigkeit).
 * @param {object} admin - firebase-admin (FieldValue, Timestamp)
 * @param {object} db - Firestore
 * @param {{mailer: function, jetztMs?: number}} params - mailer wie bei verwalten
 * @return {Promise<{gesendet: number, verworfen: number, verschoben: number}>}
 */
function versendeNeuigkeiten(admin, db, {mailer, jetztMs = Date.now()}) {
  return arbeiteVormerkerAb(admin, db, {
    collection: NEUIGKEITEN_COLLECTION,
    bearbeite: bearbeiteNeuigkeit,
    name: 'wichtelNeuigkeitenVersenden',
    mailer,
    jetztMs,
  });
}

// ---------------------------------------------------------------------------
// Erinnerung per Mail (an Gäste ohne Wünsche)
// ---------------------------------------------------------------------------

/**
 * Ob der Schenker dieses Gasts das Geschenk schon als gekauft markiert hat. Liest die
 * Zuordnung nur hier im Server; heraus geht nur ja/nein (und das nirgendwohin).
 * @param {object} db - Firestore
 * @param {string} rundeId - Runde (ausgelost)
 * @param {string} empfaengerId - der Gast, der erinnert werden soll
 * @return {Promise<boolean>}
 */
async function schenkerHatGekauft(db, rundeId, empfaengerId) {
  const zuordnung = await db.collection(zuordnungenPfad(rundeId))
      .where('empfaengerId', '==', empfaengerId).limit(1).get();
  if (zuordnung.empty) return false;
  const geber = await db.doc(`${teilnehmerPfad(rundeId)}/${zuordnung.docs[0].id}`).get();
  return geber.exists && Boolean(geber.data().geschenkGekauftAm);
}

/**
 * Ein fälliger Erinnerungs-Vormerker: prüft alles erneut und verschickt die Erinnerung. Sie
 * entfällt (Vormerker gelöscht), wenn die Runde oder der Teilnehmer fehlt, er nicht mehr mit
 * einem Gast mit Adresse verknüpft ist, schon MAX_ERINNERUNGEN bekam, inzwischen einen Wunsch
 * hat oder sein Schenker das Geschenk als gekauft markiert hat (dann hilft kein Wunsch mehr).
 * Liegt die letzte Erinnerung keine ERINNERUNG_ABSTAND_MS zurück (z. B. nach erneutem Senden der
 * Einladung), wartet sie bis dahin.
 * @param {object} ctx - {admin, db, jetztMs, transport, name}
 * @param {object} doc - Vormerker aus der Abfrage
 * @return {Promise<'gesendet'|'verworfen'|'verschoben'>}
 */
async function bearbeiteErinnerung(ctx, doc) {
  const {admin, db, jetztMs, transport, name} = ctx;
  const {rundeId, teilnehmerId} = doc.data();
  const verwerfen = async () => {
    await doc.ref.delete();
    return 'verworfen';
  };
  if (typeof rundeId !== 'string' || !ID_MUSTER.test(rundeId) ||
      typeof teilnehmerId !== 'string' || !ID_MUSTER.test(teilnehmerId)) {
    return verwerfen();
  }
  const teilnehmerRef = db.doc(`${teilnehmerPfad(rundeId)}/${teilnehmerId}`);
  const [rundeSnap, teilnehmerSnap] = await Promise.all([db.doc(rundenPfad(rundeId)).get(), teilnehmerRef.get()]);
  const runde = rundeSnap.exists ? rundeSnap.data() : null;
  const t = teilnehmerSnap.exists ? teilnehmerSnap.data() : null;
  const bisher = typeof t?.erinnerungen === 'number' ? t.erinnerungen : 0;
  if (!runde || !t || !t.gastId || bisher >= MAX_ERINNERUNGEN || zuSpaetFuerErinnerung(runde, jetztMs)) {
    return verwerfen();
  }

  const fruehestens = (millis(t.erinnerungAm) ?? -Infinity) + ERINNERUNG_ABSTAND_MS;
  if (fruehestens > jetztMs) {
    await doc.ref.update({faelligAm: admin.firestore.Timestamp.fromMillis(fruehestens)});
    return 'verschoben';
  }

  const eigene = await ladeEintraege(db, rundeId, 'autorId', teilnehmerId, MAX_EINTRAEGE_PRO_AUTOR);
  if (eigene.some((e) => e.ueberId === teilnehmerId)) return verwerfen();
  if (runde.status === 'ausgelost' && await schenkerHatGekauft(db, rundeId, teilnehmerId)) return verwerfen();
  const gast = (await ladeGaeste(db, runde.ownerId, [t.gastId])).get(t.gastId);
  if (!gast?.email) return verwerfen();

  let erlaubt = 0;
  try {
    erlaubt = await reserviereMails(db, runde.ownerId, 1, jetztMs);
  } catch (err) {
    // Schlägt geschlossen fehl: ohne prüfbares Limit geht keine Mail raus.
    console.error(`${name}: Mail-Limit von ${runde.ownerId} nicht prüfbar:`, mailFehlerCode(err));
  }
  if (erlaubt < 1) return verschiebeVormerker(ctx, doc, {fehlversuch: false});

  try {
    await transport.senden({
      to: gast.email,
      ...baueErinnerungsMail({
        sprache: gast.sprache,
        anlass: runde.anlass,
        name: t.name,
        titel: runde.titel || '',
        budget: runde.budget || '',
        hinweis: runde.hinweis || '',
        datum: feierDatum(runde),
        link: wichtelLink(rundeId, t.token),
      }),
    });
  } catch (err) {
    console.error(`${name}: Mail an Teilnehmer ${teilnehmerId} (Runde ${rundeId}) fehlgeschlagen:`, mailFehlerCode(err));
    return verschiebeVormerker(ctx, doc, {fehlversuch: true});
  }

  // Erst der Zähler am Teilnehmer, dann der Vormerker: Scheitert Letzteres, verschiebt der nächste
  // Lauf ihn über erinnerungAm, statt gleich noch einmal zu erinnern.
  const anzahl = bisher + 1;
  await teilnehmerRef.update({erinnerungen: anzahl, erinnerungAm: admin.firestore.Timestamp.fromMillis(jetztMs)});
  if (anzahl >= MAX_ERINNERUNGEN) {
    await doc.ref.delete();
  } else {
    await doc.ref.update({
      faelligAm: admin.firestore.Timestamp.fromMillis(jetztMs + ERINNERUNG_ABSTAND_MS),
      fehlversuche: 0,
    });
  }
  return 'gesendet';
}

/**
 * Ein Lauf der geplanten Function wichtelErinnerungenVersenden: verschickt fällige
 * Erinnerungen an Gäste ohne Wünsche (bearbeiteErinnerung).
 * @param {object} admin - firebase-admin (FieldValue, Timestamp)
 * @param {object} db - Firestore
 * @param {{mailer: function, jetztMs?: number}} params - mailer wie bei verwalten
 * @return {Promise<{gesendet: number, verworfen: number, verschoben: number}>}
 */
function versendeErinnerungen(admin, db, {mailer, jetztMs = Date.now()}) {
  return arbeiteVormerkerAb(admin, db, {
    collection: ERINNERUNGEN_COLLECTION,
    bearbeite: bearbeiteErinnerung,
    name: 'wichtelErinnerungenVersenden',
    mailer,
    jetztMs,
  });
}

/**
 * Merkt Erinnerungen für ausgewählte Teilnehmer (neu) vor: nur, wem die Einladung zugestellt wurde
 * und wer noch nicht alle MAX_ERINNERUNGEN bekommen hat. Fällig ERINNERUNG_NACH_MS nach der
 * Einladung und ERINNERUNG_ABSTAND_MS nach der letzten Erinnerung, frühestens jetzt; ob sie dann
 * noch nötig ist (Wunsch, Datum der Feier …), prüft erst der Versand. Teilnehmer ohne Feld
 * `erinnerungen` bekommen den Zähler 0. Wirft nicht: am Planen soll die Aktion nicht scheitern.
 * Gebraucht für
 *  - den Übergang (Einladungen von vor der Erinnerungs-Mail, 9. 11. 2026, haben weder Zähler noch
 *    Vormerker; geplant beim Öffnen der Runde durch den Organisator, je Teilnehmer einmal),
 *  - ein später gelegtes oder gelöschtes Datum der Feier: Erinnerungen, die der Versand wegen des
 *    alten Datums schon verworfen hat, sind dann wieder möglich.
 * @param {object} ctx - {admin, db, jetztMs}
 * @param {string} rundeId - Runde
 * @param {Array<object>} teilnehmer - aus ladeTeilnehmer
 * @param {function(object): boolean} auswahl - welche Teilnehmer in Frage kommen
 * @return {Promise<void>}
 */
async function planeErinnerungen({admin, db, jetztMs}, rundeId, teilnehmer, auswahl) {
  const offen = teilnehmer.filter((t) => t.mailStatus === 'gesendet' && t.gastId &&
    (typeof t.erinnerungen === 'number' ? t.erinnerungen : 0) < MAX_ERINNERUNGEN && auswahl(t));
  if (offen.length === 0) return;
  const jetzt = jetztMs ?? Date.now();
  try {
    await schreibeInBatches(db, offen.flatMap((t) => {
      const faellig = Math.max(jetzt, (millis(t.mailAm) ?? jetzt) + ERINNERUNG_NACH_MS,
          (millis(t.erinnerungAm) ?? -Infinity) + ERINNERUNG_ABSTAND_MS);
      return [
        (batch) => batch.set(db.doc(erinnerungPfad(rundeId, t.id)), erinnerungsVormerker(admin, rundeId, t.id, faellig)),
        ...(t.erinnerungen === undefined ?
          [(batch) => batch.update(db.doc(`${teilnehmerPfad(rundeId)}/${t.id}`), {erinnerungen: 0})] :
          []),
      ];
    }));
  } catch (err) {
    console.error(`wichtelVerwalten: Erinnerungen in Runde ${rundeId} nicht geplant:`, err);
  }
}

const VERWALTEN = {
  async liste({db, uid}) {
    const snap = await db.collection(COLLECTION).where('ownerId', '==', uid).limit(MAX_RUNDEN).get();
    // Neueste zuerst (ohne orderBy: das bräuchte einen zusammengesetzten Index).
    const runden = snap.docs
        .map((doc) => rundenKopf(doc.id, doc.data()))
        .sort((a, b) => sortierZeit(b.erstelltAm) - sortierZeit(a.erstelltAm));
    return {runden};
  },

  async laden(ctx) {
    const {db, HttpsError, uid, daten} = ctx;
    const {runde} = await ladeEigeneRunde(db, HttpsError, uid, daten.rundeId);
    const teilnehmer = await ladeTeilnehmer(db, daten.rundeId);
    await planeErinnerungen(ctx, daten.rundeId, teilnehmer, (t) => t.erinnerungen === undefined);
    return organisatorSicht(db, daten.rundeId, runde, teilnehmer);
  },

  async anlegen(ctx) {
    const {admin, db, HttpsError, uid, daten} = ctx;
    const felder = leseRundenFelder(daten, HttpsError);
    const eintraege = daten.namen === undefined ? [] : leseNamen(daten.namen, HttpsError);
    const jetzt = admin.firestore.FieldValue.serverTimestamp();
    const ref = db.collection(COLLECTION).doc();
    const runde = {
      ownerId: uid,
      datum: '',
      ...felder,
      status: 'offen',
      teilnehmerAnzahl: 0,
      ausgelostAm: null,
      erstelltAm: jetzt,
      aktualisiertAm: jetzt,
    };
    await ref.set(runde);
    if (eintraege.length > 0) await nimmTeilnehmerAuf(ctx, ref, ref.id, eintraege);
    return organisatorSicht(db, ref.id, runde);
  },

  /**
   * Titel, Anlass, Budget, Hinweis und Datum der Feier ändern – auch nach dem Auslosen. Liegt das
   * Datum danach später oder fehlt es, werden die Erinnerungen neu vorgemerkt (planeErinnerungen).
   */
  async aendern(ctx) {
    const {admin, db, HttpsError, uid, daten} = ctx;
    const {ref, runde} = await ladeEigeneRunde(db, HttpsError, uid, daten.rundeId);
    const felder = leseRundenFelder(daten, HttpsError);
    await ref.update({...felder, aktualisiertAm: admin.firestore.FieldValue.serverTimestamp()});
    const vorher = feierDatum(runde);
    const nachher = 'datum' in felder ? felder.datum : vorher;
    let teilnehmer = null;
    if (vorher && (!nachher || nachher > vorher)) {
      teilnehmer = await ladeTeilnehmer(db, daten.rundeId);
      await planeErinnerungen(ctx, daten.rundeId, teilnehmer, () => true);
    }
    return organisatorSicht(db, daten.rundeId, {...runde, ...felder}, teilnehmer);
  },

  async teilnehmerHinzufuegen(ctx) {
    const {db, HttpsError, uid, daten} = ctx;
    const {ref, runde} = await ladeEigeneRunde(db, HttpsError, uid, daten.rundeId);
    pruefeOffen(runde, HttpsError);
    const eintraege = leseNamen(daten.namen, HttpsError);
    if (eintraege.length === 0) throw new HttpsError('invalid-argument', 'Bitte gib einen Namen ein.');
    await nimmTeilnehmerAuf(ctx, ref, daten.rundeId, eintraege);
    return organisatorSicht(db, daten.rundeId, runde);
  },

  /**
   * Link (erneut) per Mail schicken – erst nach dem Auslosen: die erste Mail verschickt `auslosen`.
   * Mit `gastId` wird der Teilnehmer zugleich mit diesem Gast verknüpft (z. B. vor der
   * Gast-Verknüpfung angelegte Teilnehmer).
   */
  async einladungSenden(ctx) {
    const {db, HttpsError, uid, daten} = ctx;
    const {runde} = await ladeEigeneRunde(db, HttpsError, uid, daten.rundeId);
    if (runde.status !== 'ausgelost') {
      throw new HttpsError('failed-precondition', 'Die Einladungen gehen beim Auslosen per Mail raus.');
    }
    const teilnehmerId = pruefeId(daten.teilnehmerId, HttpsError);
    const alle = await ladeTeilnehmer(db, daten.rundeId);
    const teilnehmer = alle.find((t) => t.id === teilnehmerId);
    if (!teilnehmer) throw new HttpsError('not-found', 'Diesen Teilnehmer gibt es nicht (mehr).');
    const gastId = daten.gastId === undefined || daten.gastId === null ?
      (teilnehmer.gastId || null) :
      pruefeId(daten.gastId, HttpsError, 'invalid-argument', 'Ungültige Gast-ID.');
    if (!gastId) {
      throw new HttpsError('failed-precondition', 'Dieser Teilnehmer ist mit keinem Gast aus deiner Gästeliste verknüpft.');
    }
    const anderer = alle.find((t) => t.id !== teilnehmerId && t.gastId === gastId);
    if (anderer) throw new HttpsError('already-exists', `Dieser Gast ist schon als „${anderer.name}“ dabei.`);
    const gast = (await ladeGaeste(db, uid, [gastId])).get(gastId);
    if (!gast) throw new HttpsError('not-found', 'Diesen Gast gibt es in deiner Gästeliste nicht (mehr).');
    if (!gast.email) throw new HttpsError('failed-precondition', 'Im Gästeprofil ist keine E-Mail-Adresse hinterlegt.');
    if (teilnehmer.gastId !== gastId) {
      await db.doc(`${teilnehmerPfad(daten.rundeId)}/${teilnehmerId}`).update({gastId});
    }
    const versand = await versendeEinladungen(ctx, daten.rundeId, runde,
        [{id: teilnehmerId, name: teilnehmer.name, token: teilnehmer.token, gast}]);
    return {...await organisatorSicht(db, daten.rundeId, runde), versand};
  },

  async teilnehmerUmbenennen({db, HttpsError, uid, daten}) {
    const {runde} = await ladeEigeneRunde(db, HttpsError, uid, daten.rundeId);
    pruefeId(daten.teilnehmerId, HttpsError);
    const name = bereinige(daten.name, LAENGE.name);
    if (!name) throw new HttpsError('invalid-argument', 'Bitte gib einen Namen ein.');
    const teilnehmer = await ladeTeilnehmer(db, daten.rundeId);
    if (!teilnehmer.some((t) => t.id === daten.teilnehmerId)) {
      throw new HttpsError('not-found', 'Diesen Teilnehmer gibt es nicht (mehr).');
    }
    if (teilnehmer.some((t) => t.id !== daten.teilnehmerId && schluessel(String(t.name)) === schluessel(name))) {
      throw new HttpsError('already-exists', `„${name}“ ist schon dabei.`);
    }
    await db.doc(`${teilnehmerPfad(daten.rundeId)}/${daten.teilnehmerId}`).update({name});
    return organisatorSicht(db, daten.rundeId, runde);
  },

  async teilnehmerEntfernen({admin, db, HttpsError, uid, daten}) {
    const {ref, runde} = await ladeEigeneRunde(db, HttpsError, uid, daten.rundeId);
    pruefeOffen(runde, HttpsError);
    const teilnehmerId = pruefeId(daten.teilnehmerId, HttpsError);
    const teilnehmer = await ladeTeilnehmer(db, daten.rundeId);
    if (!teilnehmer.some((t) => t.id === teilnehmerId)) {
      throw new HttpsError('not-found', 'Diesen Teilnehmer gibt es nicht (mehr).');
    }
    // Mit dem Teilnehmer gehen seine Wünsche, seine Ideen für andere und die Ideen über ihn.
    const [vonIhm, ueberIhn] = await Promise.all([
      ladeEintraege(db, daten.rundeId, 'autorId', teilnehmerId, MAX_EINTRAEGE_PRO_AUTOR),
      ladeEintraege(db, daten.rundeId, 'ueberId', teilnehmerId, MAX_EINTRAEGE_UEBER),
    ]);
    const refs = new Map([...vonIhm, ...ueberIhn].map((e) => [e.id, e.ref]));
    const schritte = [...refs.values()].map((eintragRef) => (batch) => batch.delete(eintragRef));
    schritte.push((batch) => batch.delete(db.doc(`${teilnehmerPfad(daten.rundeId)}/${teilnehmerId}`)));
    schritte.push((batch) => batch.delete(db.doc(erinnerungPfad(daten.rundeId, teilnehmerId))));
    // Wer ihn ausgeschlossen hatte, verliert diesen Ausschluss.
    teilnehmer
        .filter((t) => t.id !== teilnehmerId && Array.isArray(t.ausschluesse) && t.ausschluesse.includes(teilnehmerId))
        .forEach((t) => schritte.push((batch) => batch.update(
            db.doc(`${teilnehmerPfad(daten.rundeId)}/${t.id}`),
            {ausschluesse: t.ausschluesse.filter((id) => id !== teilnehmerId)},
        )));
    schritte.push((batch) => batch.update(ref, {
      teilnehmerAnzahl: teilnehmer.length - 1,
      aktualisiertAm: admin.firestore.FieldValue.serverTimestamp(),
    }));
    await schreibeInBatches(db, schritte);
    return organisatorSicht(db, daten.rundeId, runde);
  },

  /**
   * Ersetzt, wen ein Teilnehmer nicht ziehen soll. Nur vor dem Auslosen. IDs, die es in der
   * Runde nicht (mehr) gibt, und der Teilnehmer selbst fallen still heraus – etwa aus einer
   * Ansicht, die ein gerade entferntes Mitglied noch zeigte.
   */
  async ausschluesseSetzen({db, HttpsError, uid, daten}) {
    const {runde} = await ladeEigeneRunde(db, HttpsError, uid, daten.rundeId);
    pruefeOffen(runde, HttpsError, 'Ausschlüsse');
    const teilnehmerId = pruefeId(daten.teilnehmerId, HttpsError);
    if (!Array.isArray(daten.ausschluesse) || daten.ausschluesse.length > MAX_TEILNEHMER) {
      throw new HttpsError('invalid-argument', 'ausschluesse muss eine Liste von Teilnehmer-IDs sein.');
    }
    daten.ausschluesse.forEach((id) => pruefeId(id, HttpsError));
    const teilnehmer = await ladeTeilnehmer(db, daten.rundeId);
    if (!teilnehmer.some((t) => t.id === teilnehmerId)) {
      throw new HttpsError('not-found', 'Diesen Teilnehmer gibt es nicht (mehr).');
    }
    const ausschluesse = ausschluesseVon(
        {id: teilnehmerId, ausschluesse: daten.ausschluesse},
        new Set(teilnehmer.map((t) => t.id)),
    );
    await db.doc(`${teilnehmerPfad(daten.rundeId)}/${teilnehmerId}`).update({ausschluesse});
    return organisatorSicht(db, daten.rundeId, runde);
  },

  /**
   * Lost aus und verschickt danach die Einladungen per Mail (ladeZurAuslosungEin). Die Antwort
   * trägt wie einladungSenden `versand`.
   */
  async auslosen(ctx) {
    const {admin, db, HttpsError, uid, daten, randomInt} = ctx;
    const {ref} = await ladeEigeneRunde(db, HttpsError, uid, daten.rundeId);
    const teilnehmer = await ladeTeilnehmer(db, daten.rundeId);
    if (teilnehmer.length < MIN_TEILNEHMER) {
      throw new HttpsError('failed-precondition', `Zum Auslosen braucht es mindestens ${MIN_TEILNEHMER} Teilnehmer.`);
    }
    const ausschluesse = ausschlussKarte(teilnehmer);
    const zuordnung = zieheKreis(teilnehmer.map((t) => t.id), {ausschluesse, randomInt});
    if (!zuordnung) throw new HttpsError('failed-precondition', meldungOhneKreis(teilnehmer, ausschluesse));
    const jetzt = admin.firestore.FieldValue.serverTimestamp();
    // Statuswechsel in einer Transaktion: ein doppelter Klick lost nicht zweimal aus.
    const runde = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const aktuell = snap.data();
      pruefeOffen(aktuell, HttpsError);
      Object.entries(zuordnung).forEach(([geberId, empfaengerId]) => {
        tx.set(db.doc(`${zuordnungenPfad(daten.rundeId)}/${geberId}`), {empfaengerId, ausgelostAm: jetzt});
      });
      teilnehmer.forEach((t) => {
        // Neue Zuordnung: Los und „Geschenk gekauft“ gelten nicht mehr.
        if (t.gezogenAm || t.geschenkGekauftAm) {
          tx.update(db.doc(`${teilnehmerPfad(daten.rundeId)}/${t.id}`), {gezogenAm: null, geschenkGekauftAm: null});
        }
      });
      tx.update(ref, {status: 'ausgelost', ausgelostAm: jetzt, aktualisiertAm: jetzt});
      return {...aktuell, status: 'ausgelost', ausgelostAm: jetzt};
    });
    const versand = await ladeZurAuslosungEin(ctx, daten.rundeId, runde, teilnehmer);
    return {...await organisatorSicht(db, daten.rundeId, runde), versand};
  },

  async zuruecksetzen({admin, db, HttpsError, uid, daten}) {
    const {ref, runde} = await ladeEigeneRunde(db, HttpsError, uid, daten.rundeId);
    if (runde.status !== 'ausgelost') {
      throw new HttpsError('failed-precondition', 'Die Runde ist noch nicht ausgelost.');
    }
    const [zuordnungen, teilnehmer] = await Promise.all([
      db.collection(zuordnungenPfad(daten.rundeId)).limit(MAX_TEILNEHMER).get(),
      ladeTeilnehmer(db, daten.rundeId),
    ]);
    const schritte = zuordnungen.docs.map((doc) => (batch) => batch.delete(doc.ref));
    teilnehmer.filter((t) => t.gezogenAm || t.geschenkGekauftAm).forEach((t) => {
      schritte.push((batch) => batch.update(
          db.doc(`${teilnehmerPfad(daten.rundeId)}/${t.id}`), {gezogenAm: null, geschenkGekauftAm: null}));
    });
    schritte.push((batch) => batch.update(ref, {
      status: 'offen',
      ausgelostAm: null,
      aktualisiertAm: admin.firestore.FieldValue.serverTimestamp(),
    }));
    await schreibeInBatches(db, schritte);
    await loescheVormerker(db, daten.rundeId);
    return organisatorSicht(db, daten.rundeId, {...runde, status: 'offen', ausgelostAm: null});
  },

  async loeschen({db, HttpsError, uid, daten}) {
    const {ref} = await ladeEigeneRunde(db, HttpsError, uid, daten.rundeId);
    await db.recursiveDelete(ref);
    await loescheVormerker(db, daten.rundeId);
    await loescheVormerker(db, daten.rundeId, ERINNERUNGEN_COLLECTION);
    return {geloescht: true};
  },
};

/**
 * Callable wichtelVerwalten. Input: { aktion, ...daten }.
 * @param {object} admin - firebase-admin (für FieldValue)
 * @param {object} db - Firestore
 * @param {function} HttpsError - Fehlerklasse
 * @param {{auth: object, daten: object, randomInt?: function, mailer?: function, jetztMs?: number}} params
 *   mailer: liefert {senden(mail), schliessen()} oder null (kein SMTP eingerichtet); wird nur
 *   aufgerufen, wenn eine Mail rausgehen soll. jetztMs: Zeit für Tageslimit und Erinnerungstermine (Tests).
 * @return {Promise<object>}
 */
async function verwalten(admin, db, HttpsError, {auth, daten, randomInt, mailer, jetztMs}) {
  const {uid, vorname} = await pruefeOrganisator(db, HttpsError, auth);
  const eingabe = daten && typeof daten === 'object' ? daten : {};
  const aktion = Object.prototype.hasOwnProperty.call(VERWALTEN, eingabe.aktion) ? VERWALTEN[eingabe.aktion] : null;
  if (!aktion) throw new HttpsError('invalid-argument', 'Unbekannte Aktion.');
  return aktion({admin, db, HttpsError, uid, organisatorName: vorname, daten: eingabe, randomInt, mailer, jetztMs});
}

// ---------------------------------------------------------------------------
// Teilnehmer (persönlicher Link)
// ---------------------------------------------------------------------------

/**
 * Löst rundeId + Token zum Teilnehmer auf. Falsches Format, unbekannte Runde und
 * falsches Token ergeben dieselbe Antwort, damit sich nichts ausprobieren lässt.
 */
async function ladeKontext(db, HttpsError, daten) {
  const {rundeId, token} = daten;
  if (typeof rundeId !== 'string' || !ID_MUSTER.test(rundeId) ||
      typeof token !== 'string' || !TOKEN_MUSTER.test(token)) {
    throw new HttpsError('not-found', LINK_UNGUELTIG);
  }
  const rundeSnap = await db.doc(rundenPfad(rundeId)).get();
  if (!rundeSnap.exists) throw new HttpsError('not-found', LINK_UNGUELTIG);
  const treffer = await db.collection(teilnehmerPfad(rundeId)).where('token', '==', token).limit(1).get();
  if (treffer.empty) throw new HttpsError('not-found', LINK_UNGUELTIG);
  const doc = treffer.docs[0];
  return {rundeId, runde: rundeSnap.data(), ich: {id: doc.id, ref: doc.ref, ...doc.data()}};
}

/**
 * Sprache der Teilnehmerseite: die Sprachpräferenz aus dem Gästeprofil, mit dem der
 * Organisator den Teilnehmer verknüpft hat (`gastId`). Gelesen wird nur unter den Profilen
 * des Organisators der Runde (guests/{ownerId}/profiles), heraus geht nur der Sprachcode.
 * Ohne verknüpftes Profil null – dann wählt die Seite (Browsersprache, sonst Deutsch).
 * Ein Lesefehler ergibt ebenfalls null: an der Sprache soll die Seite nicht scheitern.
 * @param {object} db - Firestore
 * @param {object} runde - Rundendokument (ownerId)
 * @param {object} ich - Teilnehmerdokument (gastId)
 * @return {Promise<string|null>}
 */
async function ladeSprache(db, runde, ich) {
  const {gastId} = ich;
  if (typeof runde.ownerId !== 'string' || !runde.ownerId ||
      typeof gastId !== 'string' || !ID_MUSTER.test(gastId)) {
    return null;
  }
  try {
    const snap = await db.doc(`guests/${runde.ownerId}/profiles/${gastId}`).get();
    if (!snap.exists) return null;
    // Profile ohne Feld und unbekannte Werte gelten als Deutsch (wie bei der Mail).
    return normalisiereSprache(snap.data()?.sprache);
  } catch (err) {
    console.error(`wichtelTeilnahme: Sprache aus Gästeprofil ${gastId} nicht lesbar:`, err);
    return null;
  }
}

/**
 * Was ein Teilnehmer sieht. Die Einträge über den Empfänger werden nur gelesen, wenn er
 * sein Los gezogen hat; über ihn selbst geschriebene Ideen anderer nie.
 */
async function teilnehmerSicht(db, {rundeId, runde, ich}) {
  const [teilnehmer, meine, sprache] = await Promise.all([
    ladeTeilnehmer(db, rundeId),
    ladeEintraege(db, rundeId, 'autorId', ich.id, MAX_EINTRAEGE_PRO_AUTOR),
    ladeSprache(db, runde, ich),
  ]);
  const namen = new Map(teilnehmer.map((t) => [t.id, t.name]));

  let los = null;
  if (runde.status === 'ausgelost') {
    los = {gezogen: false};
    if (ich.gezogenAm) {
      const zuordnung = await db.doc(`${zuordnungenPfad(rundeId)}/${ich.id}`).get();
      const empfaengerId = zuordnung.exists ? zuordnung.data().empfaengerId : null;
      if (empfaengerId && namen.has(empfaengerId)) {
        const ueber = await ladeEintraege(db, rundeId, 'ueberId', empfaengerId, MAX_EINTRAEGE_UEBER);
        los = {
          gezogen: true,
          gekauft: Boolean(ich.geschenkGekauftAm),
          empfaenger: {id: empfaengerId, name: namen.get(empfaengerId)},
          wuensche: ueber.filter((e) => e.autorId === empfaengerId).map(eintragInhalt),
          ideen: ueber.filter((e) => e.autorId !== empfaengerId).map((e) => ({
            ...eintragInhalt(e),
            vonDir: e.autorId === ich.id,
            von: namen.get(e.autorId) || null,
          })),
        };
      }
    }
  }

  return {
    runde: {
      titel: runde.titel || '',
      budget: runde.budget || '',
      hinweis: runde.hinweis || '',
      datum: feierDatum(runde),
      status: runde.status === 'ausgelost' ? 'ausgelost' : 'offen',
    },
    // Jede Antwort trägt die Sprache: die Seite ersetzt ihren Stand mit jeder Antwort.
    ich: {id: ich.id, name: ich.name, sprache},
    andere: teilnehmer.filter((t) => t.id !== ich.id).map((t) => ({id: t.id, name: t.name})).sort(nachName),
    meineWuensche: meine.filter((e) => e.ueberId === ich.id).map(eintragInhalt),
    meineIdeen: meine
        .filter((e) => e.ueberId !== ich.id && namen.has(e.ueberId))
        .map((e) => ({...eintragInhalt(e), ueberId: e.ueberId, ueberName: namen.get(e.ueberId)})),
    los,
  };
}

const TEILNAHME = {
  async laden({admin, db, kontext}) {
    if (!kontext.ich.geoeffnetAm) {
      const jetzt = admin.firestore.FieldValue.serverTimestamp();
      await kontext.ich.ref.update({geoeffnetAm: jetzt});
      kontext.ich.geoeffnetAm = jetzt;
    }
    return teilnehmerSicht(db, kontext);
  },

  async ziehen({admin, db, HttpsError, kontext}) {
    if (kontext.runde.status !== 'ausgelost') {
      throw new HttpsError('failed-precondition', 'Es wurde noch nicht ausgelost. Schau später noch einmal vorbei.');
    }
    const zuordnung = await db.doc(`${zuordnungenPfad(kontext.rundeId)}/${kontext.ich.id}`).get();
    if (!zuordnung.exists) {
      throw new HttpsError('failed-precondition', 'Für dich liegt in dieser Auslosung kein Los bereit. Sprich den Organisator an.');
    }
    if (!kontext.ich.gezogenAm) {
      const jetzt = admin.firestore.FieldValue.serverTimestamp();
      const felder = {gezogenAm: jetzt};
      if (!kontext.ich.geoeffnetAm) felder.geoeffnetAm = jetzt;
      await kontext.ich.ref.update(felder);
      Object.assign(kontext.ich, felder);
    }
    return teilnehmerSicht(db, kontext);
  },

  /**
   * „Geschenk gekauft“ setzen oder zurücknehmen (`gekauft`: true/false). Nur, wer sein Los
   * gezogen hat; der Organisator sieht danach den Status, nie für wen.
   */
  async geschenkGekauft({admin, db, HttpsError, kontext, daten}) {
    if (typeof daten.gekauft !== 'boolean') {
      throw new HttpsError('invalid-argument', 'Bitte gib an, ob das Geschenk gekauft ist.');
    }
    if (kontext.runde.status !== 'ausgelost' || !kontext.ich.gezogenAm) {
      throw new HttpsError('failed-precondition', 'Du kannst das erst markieren, wenn du dein Los gezogen hast.');
    }
    if (Boolean(kontext.ich.geschenkGekauftAm) !== daten.gekauft) {
      const wert = daten.gekauft ? admin.firestore.FieldValue.serverTimestamp() : null;
      await kontext.ich.ref.update({geschenkGekauftAm: wert});
      kontext.ich.geschenkGekauftAm = wert;
    }
    return teilnehmerSicht(db, kontext);
  },

  async eintragHinzufuegen({admin, db, HttpsError, kontext, daten, ladeVorschau, jetztMs}) {
    const ueberId = pruefeId(daten.ueberId, HttpsError);
    const {text, url} = leseEintrag(daten, HttpsError);
    const teilnehmer = await ladeTeilnehmer(db, kontext.rundeId);
    if (!teilnehmer.some((t) => t.id === ueberId)) {
      throw new HttpsError('not-found', 'Diesen Gast gibt es in der Runde nicht (mehr).');
    }
    const meine = await ladeEintraege(db, kontext.rundeId, 'autorId', kontext.ich.id, MAX_EINTRAEGE_PRO_AUTOR);
    if (meine.length >= MAX_EINTRAEGE_PRO_AUTOR) {
      throw new HttpsError('resource-exhausted', `Du hast schon ${MAX_EINTRAEGE_PRO_AUTOR} Einträge. Lösche zuerst einen.`);
    }
    // Erst nach allen Prüfungen: der Abruf dauert bis zu 5 s und scheitert nie am Speichern.
    const vorschau = url ? await ladeVorschau(url) : null;
    await db.collection(eintraegePfad(kontext.rundeId)).doc().set({
      autorId: kontext.ich.id,
      ueberId,
      text,
      ...(url ? {url, vorschau} : {}),
      erstelltAm: admin.firestore.FieldValue.serverTimestamp(),
    });
    const [, sicht] = await Promise.all([
      merkeNeuigkeitVor(admin, db, {...kontext, autorId: kontext.ich.id, ueberId, jetztMs: jetztMs ?? Date.now()}),
      teilnehmerSicht(db, kontext),
    ]);
    return sicht;
  },

  async eintragLoeschen({db, HttpsError, kontext, daten}) {
    const eintragId = pruefeId(daten.eintragId, HttpsError);
    const ref = db.doc(`${eintraegePfad(kontext.rundeId)}/${eintragId}`);
    const snap = await ref.get();
    // Fremde Einträge sehen aus wie nicht vorhandene.
    if (snap.exists && snap.data()?.autorId === kontext.ich.id) await ref.delete();
    return teilnehmerSicht(db, kontext);
  },
};

/**
 * Callable wichtelTeilnahme (ohne Login). Input: { aktion, rundeId, token, ...daten }.
 * @param {object} admin - firebase-admin (für FieldValue)
 * @param {object} db - Firestore
 * @param {function} HttpsError - Fehlerklasse
 * @param {{daten: object, ladeVorschau?: function, jetztMs?: number}} params - ladeVorschau und
 *   jetztMs (Zeit für den Termin einer Neuigkeiten-Mail) nur für Tests ersetzt
 * @return {Promise<object>}
 */
async function teilnahme(admin, db, HttpsError, {daten, ladeVorschau = linkVorschau.ladeVorschau, jetztMs}) {
  const eingabe = daten && typeof daten === 'object' ? daten : {};
  const aktion = Object.prototype.hasOwnProperty.call(TEILNAHME, eingabe.aktion) ? TEILNAHME[eingabe.aktion] : null;
  if (!aktion) throw new HttpsError('invalid-argument', 'Unbekannte Aktion.');
  const kontext = await ladeKontext(db, HttpsError, eingabe);
  return aktion({admin, db, HttpsError, kontext, daten: eingabe, ladeVorschau, jetztMs});
}

module.exports = {
  verwalten,
  teilnahme,
  versendeNeuigkeiten,
  versendeErinnerungen,
  zieheKreis,
  neuesToken,
  _internal: {
    bereinige, leseNamen, neuesGastprofil, sucheKreis, sperrPruefung, berlinerTag,
    MIN_TEILNEHMER, MAX_TEILNEHMER, MAX_EINTRAEGE_PRO_AUTOR, MAX_MAILS_PRO_TAG, LAENGE, TOKEN_MUSTER, EMAIL_MUSTER, APP_URL,
    NEUIGKEITEN_COLLECTION, SAMMELFENSTER_MS, MINDESTABSTAND_MS, NEUER_VERSUCH_MS, MAX_FEHLVERSUCHE,
    GEKAUFT_PARAMETER,
    ERINNERUNGEN_COLLECTION, ERINNERUNG_NACH_MS, ERINNERUNG_ABSTAND_MS, MAX_ERINNERUNGEN, ERINNERUNG_VORLAUF_TAGE,
    istDatum, verschiebeTag,
  },
};
