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
 * Organisators verknüpft sein (gastId → guests/{ownerId}/profiles/{gastId}). Hat der Gast
 * eine E-Mail-Adresse, geht der persönliche Link beim Eintragen automatisch per Mail raus,
 * in der Sprache aus dem Gästeprofil (wichtelMail.js). Adresse und Sprache werden bei jedem
 * Versand frisch aus dem Gästeprofil gelesen und nie in der Runde gespeichert; Empfänger
 * sind nur Adressen aus der eigenen Gästeliste, je Organisator höchstens MAX_MAILS_PRO_TAG
 * am Tag (gegen Missbrauch als Mail-Relay, vgl. Tech-Check S6).
 *
 * Einträge (Wünsche, Ideen) haben Text und/oder einen Link. Zum Link holt der Server beim
 * Speichern einmal eine Vorschau (Bild, Titel, Seite; linkVorschau.js) und legt sie mit ab.
 *
 * Aufbau wie follow.js: reine Funktionen mit (admin, db, HttpsError, params), damit die
 * Tests sie mit einem Firestore-Ersatz aufrufen können. Den SMTP-Versand reicht der
 * Handler als `mailer` herein (handlers/wichteln.js).
 */

const crypto = require('crypto');
const linkVorschau = require('./linkVorschau');
const {normalisiereSprache} = require('./shared/sprachen');
const {baueEinladungsMail} = require('./wichtelMail');

const COLLECTION = 'wichtelRunden';
const MAIL_LIMIT_COLLECTION = 'wichtelMailLimits';
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

const LAENGE = {titel: 80, budget: 40, hinweis: 300, name: 60, text: 300};
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
// trennen oder umschließen (eine Adresse = genau ein Empfänger).
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
 * Teilnehmer aus der Eingabe: je Eintrag ein Name (String) oder {name, gastId} für einen
 * Gast aus der eigenen Gästeliste. Bereinigt, ohne leere und ohne doppelte Namen
 * (Groß-/Kleinschreibung egal).
 * @param {*} namen - Array aus Strings oder {name, gastId}
 * @param {function} HttpsError - Fehlerklasse
 * @return {Array<{name: string, gastId: string|null}>}
 */
function leseNamen(namen, HttpsError) {
  if (!Array.isArray(namen)) throw new HttpsError('invalid-argument', 'namen muss eine Liste sein.');
  if (namen.length > MAX_TEILNEHMER) {
    throw new HttpsError('invalid-argument', `Höchstens ${MAX_TEILNEHMER} Teilnehmer pro Runde.`);
  }
  const gesehen = new Set();
  const ergebnis = [];
  namen.forEach((roh) => {
    const istObjekt = roh !== null && typeof roh === 'object';
    const gastId = istObjekt && roh.gastId !== undefined && roh.gastId !== null ?
      pruefeId(roh.gastId, HttpsError, 'invalid-argument', 'Ungültige Gast-ID.') :
      null;
    const name = bereinige(istObjekt ? roh.name : roh, LAENGE.name);
    if (!name || gesehen.has(schluessel(name))) return;
    gesehen.add(schluessel(name));
    ergebnis.push({name, gastId});
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

function rundenKopf(rundeId, runde, teilnehmerAnzahl) {
  return {
    id: rundeId,
    titel: runde.titel || '',
    anlass: ANLAESSE.has(runde.anlass) ? runde.anlass : '',
    budget: runde.budget || '',
    hinweis: runde.hinweis || '',
    status: runde.status === 'ausgelost' ? 'ausgelost' : 'offen',
    teilnehmerAnzahl: typeof teilnehmerAnzahl === 'number' ? teilnehmerAnzahl : (runde.teilnehmerAnzahl || 0),
    erstelltAm: millis(runde.erstelltAm),
    ausgelostAm: millis(runde.ausgelostAm),
  };
}

/**
 * Was der Organisator sieht: Runde, Teilnehmer mit Link-Token, Status, Ausschlüssen,
 * verknüpftem Gast und Ergebnis der letzten Mail. Bewusst ohne Zuordnungen und ohne Einträge.
 */
async function organisatorSicht(db, rundeId, runde) {
  const teilnehmer = await ladeTeilnehmer(db, rundeId);
  const ausschluesse = ausschlussKarte(teilnehmer);
  return {
    runde: rundenKopf(rundeId, runde, teilnehmer.length),
    teilnehmer: teilnehmer.map((t) => ({
      id: t.id,
      name: t.name,
      token: t.token,
      geoeffnet: Boolean(t.geoeffnetAm),
      gezogen: Boolean(t.gezogenAm),
      ausschluesse: ausschluesse.get(t.id),
      gastId: t.gastId || null,
      mail: MAIL_STATUS.has(t.mailStatus) ? {status: t.mailStatus, am: millis(t.mailAm)} : null,
    })),
  };
}

function leseRundenFelder(daten, HttpsError) {
  const titel = bereinige(daten.titel, LAENGE.titel);
  if (!titel) throw new HttpsError('invalid-argument', 'Bitte gib der Runde einen Titel.');
  return {
    titel,
    anlass: ANLAESSE.has(daten.anlass) ? daten.anlass : '',
    budget: bereinige(daten.budget, LAENGE.budget),
    hinweis: bereinige(daten.hinweis, LAENGE.hinweis),
  };
}

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

/**
 * Gäste zu den IDs aus der eigenen Gästeliste des Organisators. Fremde und gelöschte Gäste
 * fehlen in der Antwort; nur dieser Pfad wird gelesen, nie die Gästeliste eines anderen.
 * @param {object} db - Firestore
 * @param {string} uid - Organisator
 * @param {Array<string|null>} gastIds - geprüfte IDs (pruefeId)
 * @return {Promise<Map<string, {email: string|null, sprache: string}>>}
 */
async function ladeGaeste(db, uid, gastIds) {
  const ids = [...new Set(gastIds.filter(Boolean))];
  const snaps = await Promise.all(ids.map((id) => db.doc(`guests/${uid}/profiles/${id}`).get()));
  const gaeste = new Map();
  snaps.forEach((snap, i) => {
    if (!snap.exists) return;
    const daten = snap.data() || {};
    const email = typeof daten.email === 'string' ? daten.email.trim().toLowerCase() : '';
    gaeste.set(ids[i], {email: EMAIL_MUSTER.test(email) ? email : null, sprache: normalisiereSprache(daten.sprache)});
  });
  return gaeste;
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

/**
 * Verschickt die persönlichen Links an Teilnehmer, deren Gast eine E-Mail-Adresse hat, und
 * merkt sich je Teilnehmer das Ergebnis (mailStatus, mailAm). Wirft nicht: Was nicht
 * rausging, steht als 'fehler' am Teilnehmer und in der Antwort (grund).
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

  const transport = typeof ctx.mailer === 'function' ? ctx.mailer() : null;
  let erlaubt = 0;
  if (!transport) {
    ergebnis.grund = 'nicht-eingerichtet';
  } else {
    try {
      erlaubt = await reserviereMails(db, uid, empfaenger.length, ctx.jetztMs ?? Date.now());
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
  await schreibeInBatches(db, [...status].map(([id, mailStatus]) => (batch) => batch.update(
      db.doc(`${teilnehmerPfad(rundeId)}/${id}`), {mailStatus, mailAm: jetzt})));
  status.forEach((mailStatus) => {
    if (mailStatus === 'gesendet') ergebnis.gesendet += 1;
    else ergebnis.fehlgeschlagen += 1;
  });
  return ergebnis;
}

/**
 * Legt Teilnehmer an (Gast-Verknüpfung nur zu Gästen aus der eigenen Gästeliste) und schickt
 * denen mit E-Mail-Adresse ihren Link.
 * @param {object} ctx - Aufrufkontext (admin, db, HttpsError, uid, mailer, ...)
 * @param {object} rundeRef - Runde
 * @param {string} rundeId - Runde
 * @param {object} runde - Rundendaten (für die Mail)
 * @param {Array<{name: string, gastId: string|null}>} eintraege - aus leseNamen
 * @return {Promise<{gesendet: number, fehlgeschlagen: number, grund: string|null}>} Versand
 */
async function nimmTeilnehmerAuf(ctx, rundeRef, rundeId, runde, eintraege) {
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
  const jetzt = admin.firestore.FieldValue.serverTimestamp();
  const start = vorhanden.reduce((max, t) => Math.max(max, t.reihenfolge || 0), 0);
  const sammlung = db.collection(teilnehmerPfad(rundeId));
  const neue = eintraege.map((e, i) => ({
    ref: sammlung.doc(),
    name: e.name,
    token: neuesToken(),
    gastId: gaeste.has(e.gastId) ? e.gastId : null,
    reihenfolge: start + i + 1,
  }));
  const schritte = neue.map((t) => (batch) => batch.set(t.ref, {
    name: t.name,
    token: t.token,
    gastId: t.gastId,
    reihenfolge: t.reihenfolge,
    ausschluesse: [],
    geoeffnetAm: null,
    gezogenAm: null,
    mailStatus: null,
    mailAm: null,
    erstelltAm: jetzt,
  }));
  schritte.push((batch) => batch.update(rundeRef, {
    teilnehmerAnzahl: vorhanden.length + neue.length,
    aktualisiertAm: jetzt,
  }));
  await schreibeInBatches(db, schritte);

  const empfaenger = neue
      .filter((t) => t.gastId && gaeste.get(t.gastId).email)
      .map((t) => ({id: t.ref.id, name: t.name, token: t.token, gast: gaeste.get(t.gastId)}));
  return versendeEinladungen(ctx, rundeId, runde, empfaenger);
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

  async laden({db, HttpsError, uid, daten}) {
    const {runde} = await ladeEigeneRunde(db, HttpsError, uid, daten.rundeId);
    return organisatorSicht(db, daten.rundeId, runde);
  },

  async anlegen(ctx) {
    const {admin, db, HttpsError, uid, daten} = ctx;
    const felder = leseRundenFelder(daten, HttpsError);
    const eintraege = daten.namen === undefined ? [] : leseNamen(daten.namen, HttpsError);
    const jetzt = admin.firestore.FieldValue.serverTimestamp();
    const ref = db.collection(COLLECTION).doc();
    const runde = {
      ownerId: uid,
      ...felder,
      status: 'offen',
      teilnehmerAnzahl: 0,
      ausgelostAm: null,
      erstelltAm: jetzt,
      aktualisiertAm: jetzt,
    };
    await ref.set(runde);
    const versand = eintraege.length > 0 ?
      await nimmTeilnehmerAuf(ctx, ref, ref.id, runde, eintraege) :
      keinVersand();
    return {...await organisatorSicht(db, ref.id, runde), versand};
  },

  async aendern({admin, db, HttpsError, uid, daten}) {
    const {ref, runde} = await ladeEigeneRunde(db, HttpsError, uid, daten.rundeId);
    const felder = leseRundenFelder(daten, HttpsError);
    await ref.update({...felder, aktualisiertAm: admin.firestore.FieldValue.serverTimestamp()});
    return organisatorSicht(db, daten.rundeId, {...runde, ...felder});
  },

  async teilnehmerHinzufuegen(ctx) {
    const {db, HttpsError, uid, daten} = ctx;
    const {ref, runde} = await ladeEigeneRunde(db, HttpsError, uid, daten.rundeId);
    pruefeOffen(runde, HttpsError);
    const eintraege = leseNamen(daten.namen, HttpsError);
    if (eintraege.length === 0) throw new HttpsError('invalid-argument', 'Bitte gib einen Namen ein.');
    const versand = await nimmTeilnehmerAuf(ctx, ref, daten.rundeId, runde, eintraege);
    return {...await organisatorSicht(db, daten.rundeId, runde), versand};
  },

  /**
   * Link (erneut) per Mail schicken, auch nach dem Auslosen. Mit `gastId` wird der Teilnehmer
   * zugleich mit diesem Gast verknüpft (z. B. vor der Gast-Verknüpfung angelegte Teilnehmer).
   */
  async einladungSenden(ctx) {
    const {db, HttpsError, uid, daten} = ctx;
    const {runde} = await ladeEigeneRunde(db, HttpsError, uid, daten.rundeId);
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

  async auslosen({admin, db, HttpsError, uid, daten, randomInt}) {
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
        if (t.gezogenAm) tx.update(db.doc(`${teilnehmerPfad(daten.rundeId)}/${t.id}`), {gezogenAm: null});
      });
      tx.update(ref, {status: 'ausgelost', ausgelostAm: jetzt, aktualisiertAm: jetzt});
      return {...aktuell, status: 'ausgelost', ausgelostAm: jetzt};
    });
    return organisatorSicht(db, daten.rundeId, runde);
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
    teilnehmer.filter((t) => t.gezogenAm).forEach((t) => {
      schritte.push((batch) => batch.update(db.doc(`${teilnehmerPfad(daten.rundeId)}/${t.id}`), {gezogenAm: null}));
    });
    schritte.push((batch) => batch.update(ref, {
      status: 'offen',
      ausgelostAm: null,
      aktualisiertAm: admin.firestore.FieldValue.serverTimestamp(),
    }));
    await schreibeInBatches(db, schritte);
    return organisatorSicht(db, daten.rundeId, {...runde, status: 'offen', ausgelostAm: null});
  },

  async loeschen({db, HttpsError, uid, daten}) {
    const {ref} = await ladeEigeneRunde(db, HttpsError, uid, daten.rundeId);
    await db.recursiveDelete(ref);
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
 *   aufgerufen, wenn eine Mail rausgehen soll. jetztMs: Zeit für das Tageslimit (Tests).
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

  async eintragHinzufuegen({admin, db, HttpsError, kontext, daten, ladeVorschau}) {
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
    return teilnehmerSicht(db, kontext);
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
 * @param {{daten: object, ladeVorschau?: function}} params - ladeVorschau nur für Tests ersetzt
 * @return {Promise<object>}
 */
async function teilnahme(admin, db, HttpsError, {daten, ladeVorschau = linkVorschau.ladeVorschau}) {
  const eingabe = daten && typeof daten === 'object' ? daten : {};
  const aktion = Object.prototype.hasOwnProperty.call(TEILNAHME, eingabe.aktion) ? TEILNAHME[eingabe.aktion] : null;
  if (!aktion) throw new HttpsError('invalid-argument', 'Unbekannte Aktion.');
  const kontext = await ladeKontext(db, HttpsError, eingabe);
  return aktion({admin, db, HttpsError, kontext, daten: eingabe, ladeVorschau});
}

module.exports = {
  verwalten,
  teilnahme,
  zieheKreis,
  neuesToken,
  _internal: {
    bereinige, leseNamen, sucheKreis, sperrPruefung, berlinerTag,
    MIN_TEILNEHMER, MAX_TEILNEHMER, MAX_EINTRAEGE_PRO_AUTOR, MAX_MAILS_PRO_TAG, LAENGE, TOKEN_MUSTER, APP_URL,
  },
};
