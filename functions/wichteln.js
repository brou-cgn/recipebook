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
 * Aufbau wie follow.js: reine Funktionen mit (admin, db, HttpsError, params), damit die
 * Tests sie mit einem Firestore-Ersatz aufrufen können.
 */

const crypto = require('crypto');

const COLLECTION = 'wichtelRunden';
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
const ORGANISATOR_ROLLEN = new Set(['edit', 'moderator', 'admin']);

// Firestore-Auto-IDs (20 Zeichen); etwas Spielraum, keine Schrägstriche.
const ID_MUSTER = /^[A-Za-z0-9]{10,40}$/;
// 24 Zufallsbytes als base64url = 32 Zeichen (192 Bit).
const TOKEN_MUSTER = /^[A-Za-z0-9_-]{32}$/;

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
 * Namen aus der Eingabe: bereinigt, ohne leere und ohne doppelte (Groß-/Kleinschreibung egal).
 * @param {*} namen - Array von Strings
 * @param {function} HttpsError - Fehlerklasse
 * @return {string[]}
 */
function leseNamen(namen, HttpsError) {
  if (!Array.isArray(namen)) throw new HttpsError('invalid-argument', 'namen muss eine Liste sein.');
  if (namen.length > MAX_TEILNEHMER) {
    throw new HttpsError('invalid-argument', `Höchstens ${MAX_TEILNEHMER} Teilnehmer pro Runde.`);
  }
  const gesehen = new Set();
  const ergebnis = [];
  namen.forEach((roh) => {
    const name = bereinige(roh, LAENGE.name);
    if (!name || gesehen.has(schluessel(name))) return;
    gesehen.add(schluessel(name));
    ergebnis.push(name);
  });
  return ergebnis;
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
 * @return {Promise<string>} uid des Organisators
 */
async function pruefeOrganisator(db, HttpsError, auth) {
  if (!auth || !auth.uid) throw new HttpsError('unauthenticated', 'Bitte melde dich an.');
  if (auth.token?.firebase?.sign_in_provider === 'anonymous') {
    throw new HttpsError('permission-denied', 'Wichtel-Runden können nur Mitglieder anlegen.');
  }
  let role;
  try {
    const snap = await db.doc(`users/${auth.uid}`).get();
    role = snap.exists ? snap.data()?.role : null;
  } catch (err) {
    console.error(`wichtelVerwalten: Rolle von ${auth.uid} nicht lesbar:`, err);
    throw new HttpsError('unavailable', 'Deine Berechtigung konnte nicht geprüft werden. Bitte versuche es gleich noch einmal.');
  }
  if (!ORGANISATOR_ROLLEN.has(role)) {
    throw new HttpsError('permission-denied', 'Wichtel-Runden verwalten können nur Mitglieder mit Bearbeiten-Recht.');
  }
  return auth.uid;
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
    budget: runde.budget || '',
    hinweis: runde.hinweis || '',
    status: runde.status === 'ausgelost' ? 'ausgelost' : 'offen',
    teilnehmerAnzahl: typeof teilnehmerAnzahl === 'number' ? teilnehmerAnzahl : (runde.teilnehmerAnzahl || 0),
    erstelltAm: millis(runde.erstelltAm),
    ausgelostAm: millis(runde.ausgelostAm),
  };
}

/**
 * Was der Organisator sieht: Runde, Teilnehmer mit Link-Token, Status und Ausschlüssen.
 * Bewusst ohne Zuordnungen und ohne Einträge.
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
    })),
  };
}

function leseRundenFelder(daten, HttpsError) {
  const titel = bereinige(daten.titel, LAENGE.titel);
  if (!titel) throw new HttpsError('invalid-argument', 'Bitte gib der Runde einen Titel.');
  return {
    titel,
    budget: bereinige(daten.budget, LAENGE.budget),
    hinweis: bereinige(daten.hinweis, LAENGE.hinweis),
  };
}

function pruefeOffen(runde, HttpsError, was = 'Teilnehmer') {
  if (runde.status === 'ausgelost') {
    throw new HttpsError('failed-precondition', `Die Runde ist schon ausgelost. Setze die Auslosung zurück, um ${was} zu ändern.`);
  }
}

async function fuegeTeilnehmerHinzu(admin, db, HttpsError, rundeRef, rundeId, namen) {
  const vorhanden = await ladeTeilnehmer(db, rundeId);
  const belegt = new Set(vorhanden.map((t) => schluessel(String(t.name))));
  const doppelt = namen.find((name) => belegt.has(schluessel(name)));
  if (doppelt) throw new HttpsError('already-exists', `„${doppelt}“ ist schon dabei.`);
  if (vorhanden.length + namen.length > MAX_TEILNEHMER) {
    throw new HttpsError('invalid-argument', `Höchstens ${MAX_TEILNEHMER} Teilnehmer pro Runde.`);
  }
  const jetzt = admin.firestore.FieldValue.serverTimestamp();
  const start = vorhanden.reduce((max, t) => Math.max(max, t.reihenfolge || 0), 0);
  const sammlung = db.collection(teilnehmerPfad(rundeId));
  const schritte = namen.map((name, i) => (batch) => batch.set(sammlung.doc(), {
    name,
    token: neuesToken(),
    reihenfolge: start + i + 1,
    ausschluesse: [],
    geoeffnetAm: null,
    gezogenAm: null,
    erstelltAm: jetzt,
  }));
  schritte.push((batch) => batch.update(rundeRef, {
    teilnehmerAnzahl: vorhanden.length + namen.length,
    aktualisiertAm: jetzt,
  }));
  await schreibeInBatches(db, schritte);
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

  async anlegen({admin, db, HttpsError, uid, daten}) {
    const felder = leseRundenFelder(daten, HttpsError);
    const namen = daten.namen === undefined ? [] : leseNamen(daten.namen, HttpsError);
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
    if (namen.length > 0) await fuegeTeilnehmerHinzu(admin, db, HttpsError, ref, ref.id, namen);
    return organisatorSicht(db, ref.id, runde);
  },

  async aendern({admin, db, HttpsError, uid, daten}) {
    const {ref, runde} = await ladeEigeneRunde(db, HttpsError, uid, daten.rundeId);
    const felder = leseRundenFelder(daten, HttpsError);
    await ref.update({...felder, aktualisiertAm: admin.firestore.FieldValue.serverTimestamp()});
    return organisatorSicht(db, daten.rundeId, {...runde, ...felder});
  },

  async teilnehmerHinzufuegen({admin, db, HttpsError, uid, daten}) {
    const {ref, runde} = await ladeEigeneRunde(db, HttpsError, uid, daten.rundeId);
    pruefeOffen(runde, HttpsError);
    const namen = leseNamen(daten.namen, HttpsError);
    if (namen.length === 0) throw new HttpsError('invalid-argument', 'Bitte gib einen Namen ein.');
    await fuegeTeilnehmerHinzu(admin, db, HttpsError, ref, daten.rundeId, namen);
    return organisatorSicht(db, daten.rundeId, runde);
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
 * @param {{auth: object, daten: object, randomInt?: function}} params
 * @return {Promise<object>}
 */
async function verwalten(admin, db, HttpsError, {auth, daten, randomInt}) {
  const uid = await pruefeOrganisator(db, HttpsError, auth);
  const eingabe = daten && typeof daten === 'object' ? daten : {};
  const aktion = Object.prototype.hasOwnProperty.call(VERWALTEN, eingabe.aktion) ? VERWALTEN[eingabe.aktion] : null;
  if (!aktion) throw new HttpsError('invalid-argument', 'Unbekannte Aktion.');
  return aktion({admin, db, HttpsError, uid, daten: eingabe, randomInt});
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

// Sprachpräferenz im Gästeprofil (Feld `sprache`, z. B. 'en'); Profile ohne Feld gelten als Deutsch.
const SPRACHCODE = /^[a-z]{2}$/;
const STANDARD_SPRACHE = 'de';

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
    const sprache = snap.data()?.sprache;
    return typeof sprache === 'string' && SPRACHCODE.test(sprache) ? sprache : STANDARD_SPRACHE;
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
          wuensche: ueber.filter((e) => e.autorId === empfaengerId).map((e) => ({id: e.id, text: e.text})),
          ideen: ueber.filter((e) => e.autorId !== empfaengerId).map((e) => ({
            id: e.id,
            text: e.text,
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
    meineWuensche: meine.filter((e) => e.ueberId === ich.id).map((e) => ({id: e.id, text: e.text})),
    meineIdeen: meine
        .filter((e) => e.ueberId !== ich.id && namen.has(e.ueberId))
        .map((e) => ({id: e.id, ueberId: e.ueberId, ueberName: namen.get(e.ueberId), text: e.text})),
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

  async eintragHinzufuegen({admin, db, HttpsError, kontext, daten}) {
    const ueberId = pruefeId(daten.ueberId, HttpsError);
    const text = bereinige(daten.text, LAENGE.text);
    if (!text) throw new HttpsError('invalid-argument', 'Bitte schreib etwas.');
    const teilnehmer = await ladeTeilnehmer(db, kontext.rundeId);
    if (!teilnehmer.some((t) => t.id === ueberId)) {
      throw new HttpsError('not-found', 'Diesen Gast gibt es in der Runde nicht (mehr).');
    }
    const meine = await ladeEintraege(db, kontext.rundeId, 'autorId', kontext.ich.id, MAX_EINTRAEGE_PRO_AUTOR);
    if (meine.length >= MAX_EINTRAEGE_PRO_AUTOR) {
      throw new HttpsError('resource-exhausted', `Du hast schon ${MAX_EINTRAEGE_PRO_AUTOR} Einträge. Lösche zuerst einen.`);
    }
    await db.collection(eintraegePfad(kontext.rundeId)).doc().set({
      autorId: kontext.ich.id,
      ueberId,
      text,
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
 * @param {{daten: object}} params
 * @return {Promise<object>}
 */
async function teilnahme(admin, db, HttpsError, {daten}) {
  const eingabe = daten && typeof daten === 'object' ? daten : {};
  const aktion = Object.prototype.hasOwnProperty.call(TEILNAHME, eingabe.aktion) ? TEILNAHME[eingabe.aktion] : null;
  if (!aktion) throw new HttpsError('invalid-argument', 'Unbekannte Aktion.');
  const kontext = await ladeKontext(db, HttpsError, eingabe);
  return aktion({admin, db, HttpsError, kontext, daten: eingabe});
}

module.exports = {
  verwalten,
  teilnahme,
  zieheKreis,
  neuesToken,
  _internal: {
    bereinige, leseNamen, sucheKreis, sperrPruefung,
    MIN_TEILNEHMER, MAX_TEILNEHMER, MAX_EINTRAEGE_PRO_AUTOR, LAENGE, TOKEN_MUSTER,
  },
};
