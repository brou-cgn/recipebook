/**
 * Mehrsprachigkeit (Tracker docs/vorhaben/mehrsprachigkeit.md): Rezepttitel (PR 3) und
 * Rezeptinhalt (PR 4) per Gemini vom deutschen Original ins Englische und Französische
 * übersetzen (Entscheidung „Primärsprache“).
 *
 * uebersetzeRezeptTitel (Trigger auf recipes/{id}) übersetzt den Titel, sobald ein Rezept
 * angelegt oder sein Titel geändert wird, und schreibt das Feld `titelUebersetzung`
 * (Aufbau in shared/titelUebersetzung.js). Andere Änderungen am Rezept und das eigene
 * Schreiben lösen nichts aus, weil `titelUebersetzung` dann schon zum Titel passt (`quelle`)
 * und nach den geltenden Regeln entstand (`version`). Eine Übersetzung nach älteren Regeln
 * erneuert der Trigger beim nächsten Schreiben des Rezepts, einmal je Rezept.
 * Laufende Importe (`importStatus` gesetzt) warten, bis der Titel feststeht.
 *
 * backfillTitelUebersetzungen (nur admin) trägt Übersetzungen für den Bestand nach:
 * seitenweise über die Dokument-ID mit Cursor wie backfillWeinprofile, mehrere Titel je
 * Gemini-Aufruf.
 *
 * Beide schreiben nur, wenn sich das Rezept seit dem Lesen nicht geändert hat (Vorbedingung
 * lastUpdateTime). Sonst gewinnt die neuere Änderung, und deren Trigger übersetzt.
 * updatedAt bleibt unberührt, damit das Rezept nicht als geändert gilt.
 *
 * uebersetzeRezeptInhalt (Trigger auf recipes/{id}) übersetzt Zutaten und Schritte, wenn ein
 * Rezept angelegt wird oder sich sein Inhalt ändert, und schreibt rezeptUebersetzungen/{id}
 * (Aufbau in shared/inhaltUebersetzung.js); beim Löschen des Rezepts löscht er die Übersetzung.
 * Die Übersetzung liegt bewusst nicht im Rezept: Die App lädt alle Rezeptdokumente für die
 * Listen, zwei vollständige Übersetzungen darin würden die Datenmenge etwa verdreifachen.
 * backfillInhaltUebersetzungen (nur admin) trägt sie für den Bestand nach. Geschrieben wird in
 * einer Transaktion nur, wenn das Rezept noch denselben Inhalt hat (gleicher quellHash).
 *
 * uebersetzeListenwerte (nur admin, PR 5) liefert Vorschläge für Übersetzungen der Auswahllisten
 * (Kulinarik, Speisekategorien, Einheiten). Sie schreibt nichts; gespeichert wird im Client unter
 * Einstellungen › Listen & Kategorien (settings/app.listenUebersetzungen).
 * uebersetzeListenwerteAutomatisch (Trigger auf settings/app, PR 6t) übersetzt neue Listenwerte
 * selbst, sobald eine Liste sich ändert, und füllt dabei nur leere Felder.
 *
 * uebersetzeListenTexte, uebersetzeMenueTexte und uebersetzeEventTexte (Trigger auf groups/{id},
 * menus/{id} und users/{uid}/events/{id}, PR 6u) übersetzen Namen und Beschreibungen wie die
 * Rezepttitel, sobald ein Dokument angelegt wird oder sich Name oder Beschreibung ändern, und
 * schreiben das Feld `textUebersetzung` (Aufbau in shared/namenUebersetzung.js);
 * backfillTextUebersetzungen (nur admin) trägt sie für den Bestand nach.
 */

const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {onDocumentWritten} = require('firebase-functions/v2/firestore');
const {getFirestore, FieldPath} = require('firebase-admin/firestore');
const {requireAiCaller} = require('../shared/auth');
const {ALLOWED_ORIGINS} = require('../shared/common');
const {consumeDailyQuota} = require('../shared/rateLimit');
const {geminiApiKey} = require('../shared/secrets');
const {GEMINI_MODEL, geminiGenerateContentRequest} = require('../shared/geminiConfig');
const {
  MAX_TITEL_JE_AUFRUF,
  TITEL_RESPONSE_SCHEMA,
  baueTitelPrompt,
  pruefeTitelAntwort,
  brauchtTitelUebersetzung,
  baueTitelUebersetzung,
} = require('../shared/titelUebersetzung');
const {
  MAX_NAMEN_JE_AUFRUF,
  NAMEN_RESPONSE_SCHEMA,
  quelleAus,
  baueNamenPrompt,
  pruefeNamenAntwort,
  brauchtNamenUebersetzung,
  baueNamenUebersetzung,
} = require('../shared/namenUebersetzung');
const {
  INHALT_RESPONSE_SCHEMA,
  inhaltQuellHash,
  anfrageAusRezept,
  baueInhaltPrompt,
  pruefeInhaltAntwort,
  baueUebersetzungsDokument,
  istAktuelleInhaltUebersetzung,
} = require('../shared/inhaltUebersetzung');
const {
  MAX_EINTRAEGE: MAX_LISTENWERTE_JE_AUFRUF,
  LISTEN_RESPONSE_SCHEMA,
  pruefeListenEingabe,
  baueListenPrompt,
  pruefeListenAntwort,
  fehlendeListenwerte,
  ergaenzeListenUebersetzungen,
  listenStand,
} = require('../shared/listenUebersetzung');

const LIMIT_COLLECTION = 'aiTitelUebersetzungLimits';
/**
 * Tageslimits in aiTitelUebersetzungLimits, gezählt je übersetztem Titel (fail closed).
 * Der Trigger zählt für alle zusammen unter dem Schlüssel `automatik`; ist das Limit
 * erreicht, bleibt der Titel bis zum nächsten Anlass oder Backfill unübersetzt.
 * Ein Titel kostet nur wenige Token, die Grenzen schützen vor Ausreißern (Sammelimport,
 * Schleifen), nicht vor normalem Gebrauch.
 */
const LIMIT_AUTOMATIK = 3000;
const LIMIT_BACKFILL_ADMIN = 10000;
const AUTOMATIK = {userId: 'automatik', isAuthenticated: false, isAdmin: false, isModerator: false};

const GEMINI_TIMEOUT_MS = 30000;
const MAX_ID_LAENGE = 200;
/** Backfill: Rezepte je Aufruf (Standard und Obergrenze), damit ein Aufruf im Zeitlimit bleibt. */
const BACKFILL_ANZAHL_STANDARD = 25;
const BACKFILL_ANZAHL_MAX = 50;

/** Gründe in fehlerGruende der Backfill-Antwort. */
const GRUND = {
  KI: 'ki',
  SPEICHERN: 'speichern',
};

/**
 * Ein Gemini-Aufruf mit JSON-Antwort nach festem Schema (temperature 0), für Titel und Listen.
 * @param {string} apiKey
 * @param {string} prompt
 * @param {object} schema - responseSchema
 * @param {string} protokoll - Präfix und Umfang für Protokolle, etwa „titelUebersetzung (3 Titel)“
 * @return {Promise<*|null>} geparste Antwort oder null, wenn der KI-Dienst nicht brauchbar geantwortet hat
 */
async function geminiJson(apiKey, prompt, schema, protokoll) {
  const {url, headers} = geminiGenerateContentRequest(apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{parts: [{text: prompt}]}],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      }),
    });
    if (!response.ok) {
      console.error(`${protokoll}: Gemini antwortet ${response.status}`);
      return null;
    }
    const data = await response.json();
    try {
      return JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text);
    } catch {
      console.error(`${protokoll}: keine JSON-Antwort`);
      return null;
    }
  } catch (error) {
    const art = error?.name === 'AbortError' ? 'Zeitüberschreitung' : error?.message;
    console.error(`${protokoll}: Gemini nicht erreichbar: ${art}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ein Gemini-Aufruf für einen oder mehrere Titel. Fehler betreffen nur diese Titel: Sie kommen als
 * null zurück.
 * @param {string} apiKey
 * @param {string[]} titel
 * @return {Promise<Array<object|null>>} je Titel {en, fr} oder null
 */
async function uebersetzeTitel(apiKey, titel) {
  const antwort = await geminiJson(apiKey, baueTitelPrompt(titel), TITEL_RESPONSE_SCHEMA,
      `titelUebersetzung (${titel.length} Titel)`);
  return antwort === null ? titel.map(() => null) : pruefeTitelAntwort(antwort, titel.length);
}

/** Vorbedingung lastUpdateTime verletzt: Das Rezept wurde seit dem Lesen geändert. */
const istUeberholt = (error) => error?.code === 9 || error?.code === 'failed-precondition' ||
  /FAILED_PRECONDITION/.test(String(error?.message));

/**
 * Schreibt die Übersetzung an das Rezept, nur das Feld titelUebersetzung.
 * @param {{id: string, ref: object, titel: string, updateTime: *}} eintrag
 * @param {object} ergebnis - geprüftes Ergebnis aus uebersetzeTitel
 * @return {Promise<'neu'|'ueberholt'|'speichern'>}
 */
async function speichere(eintrag, ergebnis) {
  const titelUebersetzung = baueTitelUebersetzung(eintrag.titel, ergebnis, GEMINI_MODEL, Date.now());
  try {
    if (eintrag.updateTime) {
      await eintrag.ref.update({titelUebersetzung}, {lastUpdateTime: eintrag.updateTime});
    } else {
      await eintrag.ref.update({titelUebersetzung});
    }
    return 'neu';
  } catch (error) {
    if (istUeberholt(error)) return 'ueberholt';
    console.error(`titelUebersetzung: Speichern für Rezept ${eintrag.id} fehlgeschlagen: ${error?.code || error?.message}`);
    return 'speichern';
  }
}

/**
 * Trigger: übersetzt den Titel eines neuen Rezepts, einen geänderten Titel oder einen Titel,
 * dessen Übersetzung nach älteren Regeln entstand.
 */
exports.uebersetzeRezeptTitel = onDocumentWritten(
    {
      document: 'recipes/{recipeId}',
      region: 'us-central1',
      secrets: [geminiApiKey],
      memory: '256MiB',
      timeoutSeconds: 60,
      maxInstances: 5,
    },
    async (event) => {
      const nachher = event.data?.after;
      if (!nachher?.exists) return;
      const rezept = nachher.data();
      if (!brauchtTitelUebersetzung(rezept)) return;

      const id = event.params?.recipeId || nachher.id;
      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        console.error('uebersetzeRezeptTitel: GEMINI_API_KEY ist nicht gesetzt');
        return;
      }
      let quota;
      try {
        quota = await consumeDailyQuota(LIMIT_COLLECTION, LIMIT_AUTOMATIK, AUTOMATIK);
      } catch {
        return; // nicht prüfbar: fail closed, consumeDailyQuota hat schon protokolliert
      }
      if (!quota.allowed) {
        console.warn(`uebersetzeRezeptTitel: Tageslimit erreicht, Rezept ${id} bleibt vorerst unübersetzt`);
        return;
      }

      const [ergebnis] = await uebersetzeTitel(apiKey, [rezept.title]);
      if (!ergebnis) {
        console.error(`uebersetzeRezeptTitel: keine gültige Übersetzung für Rezept ${id}`);
        return;
      }
      const stand = await speichere({id, ref: nachher.ref, titel: rezept.title, updateTime: nachher.updateTime}, ergebnis);
      if (stand === 'ueberholt') {
        console.log(`uebersetzeRezeptTitel: Rezept ${id} wurde inzwischen geändert, die neuere Änderung übersetzt`);
      }
    },
);

/**
 * @param {*} data - request.data des Backfills
 * @param {string} [idArt] - Art der Dokument-ID im Cursor, nur für die Fehlermeldung
 * @return {{cursor: (string|null), anzahl: number}}
 */
function pruefeBackfillEingabe(data, idArt = 'Rezept-ID') {
  const cursor = data?.cursor ?? null;
  if (cursor !== null &&
      (typeof cursor !== 'string' || !cursor.trim() || cursor.includes('/') || cursor.length > MAX_ID_LAENGE)) {
    throw new HttpsError('invalid-argument', `cursor muss eine ${idArt} oder null sein`);
  }
  const anzahl = data?.anzahl ?? BACKFILL_ANZAHL_STANDARD;
  if (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > BACKFILL_ANZAHL_MAX) {
    throw new HttpsError('invalid-argument', `anzahl muss eine ganze Zahl von 1 bis ${BACKFILL_ANZAHL_MAX} sein`);
  }
  return {cursor, anzahl};
}

/**
 * Anzahl aller Dokumente (Rezepte, Listen) über eine Zählabfrage (liest keine Dokumente), nur für
 * die Fortschrittsanzeige; scheitert sie, fehlt die Gesamtzahl.
 * @param {object} sammlung - Collection-Referenz
 * @return {Promise<number|null>}
 */
async function zaehleDokumente(sammlung) {
  try {
    const snap = await sammlung.count().get();
    return snap.data().count;
  } catch (error) {
    console.warn(`Backfill: Zählen in ${sammlung.id || 'der Collection'} fehlgeschlagen: ${error?.message}`);
    return null;
  }
}

/**
 * Cloud Function: Titelübersetzungen für den Bestand nachtragen (nur admin).
 *
 * Eingabe: {cursor: string|null, anzahl: 1 bis 50 (Standard 25)}. Liest die nächste Seite der
 * Rezepte nach Dokument-ID ab `cursor`, überspringt Rezepte mit passender Übersetzung (gleicher
 * Titel, aktuelle `version`), ohne Titel oder mit laufendem Import (kein KI-Aufruf, kein Limit)
 * und übersetzt die übrigen, auch Übersetzungen nach älteren Regeln, in
 * Blöcken zu höchstens 25 Titeln je Gemini-Aufruf. Jeder Titel zählt gegen das Tageslimit;
 * ist es erreicht, endet die Seite vor dem ersten Rezept, das nicht mehr übersetzt werden darf.
 *
 * Antwort: {geprueft, neu, uebersprungen, fehlgeschlagen: string[], fehlerGruende,
 * naechsterCursor (null wenn fertig), fertig, tageslimitErreicht, gesamt (nur beim ersten
 * Aufruf ohne Cursor), remainingRequests, dailyLimit}. Fehlgeschlagene Rezepte werden bei
 * einem neuen Durchlauf erneut versucht.
 */
exports.backfillTitelUebersetzungen = onCall(
    {
      secrets: [geminiApiKey],
      cors: ALLOWED_ORIGINS,
      invoker: 'public',
      maxInstances: 1,
      memory: '256MiB',
      timeoutSeconds: 300,
    },
    async (request) => {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Anmeldung erforderlich');
      }
      const {cursor, anzahl} = pruefeBackfillEingabe(request.data);
      const caller = await requireAiCaller(request.auth);
      if (!caller.isAdmin) {
        throw new HttpsError('permission-denied', 'Titelübersetzungen nachtragen dürfen nur Admins.');
      }
      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        console.error('backfillTitelUebersetzungen: GEMINI_API_KEY ist nicht gesetzt');
        throw new HttpsError('failed-precondition', 'Der KI-Dienst ist nicht eingerichtet.');
      }

      const rezepte = getFirestore().collection('recipes');
      let abfrage = rezepte.orderBy(FieldPath.documentId()).limit(anzahl);
      if (cursor) abfrage = abfrage.startAfter(cursor);
      const [seite, gesamt] = await Promise.all([
        abfrage.get(),
        cursor ? Promise.resolve(null) : zaehleDokumente(rezepte),
      ]);

      let remainingRequests = null;
      let tageslimitErreicht = false;
      let letzteId = cursor;
      let geprueft = 0;
      let uebersprungen = 0;
      const zuUebersetzen = [];
      for (const snap of seite.docs) {
        const daten = snap.data() || {};
        if (!brauchtTitelUebersetzung(daten)) {
          uebersprungen += 1;
        } else {
          const quota = await consumeDailyQuota(LIMIT_COLLECTION, LIMIT_BACKFILL_ADMIN, caller);
          if (!quota.allowed) {
            tageslimitErreicht = true;
            break;
          }
          remainingRequests = quota.remaining;
          zuUebersetzen.push({id: snap.id, ref: snap.ref, titel: daten.title, updateTime: snap.updateTime});
        }
        letzteId = snap.id;
        geprueft += 1;
      }

      if (tageslimitErreicht && geprueft === 0) {
        throw new HttpsError(
            'resource-exhausted',
            `Tageslimit für Titelübersetzungen erreicht (${LIMIT_BACKFILL_ADMIN}). Versuche es morgen erneut.`,
        );
      }

      let neu = 0;
      const fehlgeschlagen = [];
      const fehlerGruende = {};
      for (let start = 0; start < zuUebersetzen.length; start += MAX_TITEL_JE_AUFRUF) {
        const block = zuUebersetzen.slice(start, start + MAX_TITEL_JE_AUFRUF);
        const ergebnisse = await uebersetzeTitel(apiKey, block.map((eintrag) => eintrag.titel));
        for (const [index, eintrag] of block.entries()) {
          if (!ergebnisse[index]) {
            fehlgeschlagen.push(eintrag.id);
            fehlerGruende[eintrag.id] = GRUND.KI;
            continue;
          }
          const stand = await speichere(eintrag, ergebnisse[index]);
          if (stand === 'neu') {
            neu += 1;
          } else if (stand === 'ueberholt') {
            uebersprungen += 1; // inzwischen geändert: der Trigger übersetzt den neuen Titel
          } else {
            fehlgeschlagen.push(eintrag.id);
            fehlerGruende[eintrag.id] = GRUND.SPEICHERN;
          }
        }
      }

      const fertig = !tageslimitErreicht && seite.docs.length < anzahl;
      console.log(`backfillTitelUebersetzungen: ${geprueft} geprüft, ${neu} neu, ${uebersprungen} übersprungen, ` +
        `${fehlgeschlagen.length} fehlgeschlagen${fertig ? ', fertig' : ''}`);
      return {
        geprueft,
        neu,
        uebersprungen,
        fehlgeschlagen,
        fehlerGruende,
        naechsterCursor: fertig ? null : letzteId,
        fertig,
        tageslimitErreicht,
        gesamt,
        remainingRequests,
        dailyLimit: LIMIT_BACKFILL_ADMIN,
      };
    },
);

// ── Rezeptinhalt (PR 4) ───────────────────────────────────────────────────────

const UEBERSETZUNGEN = 'rezeptUebersetzungen';
const INHALT_LIMIT_COLLECTION = 'aiInhaltUebersetzungLimits';
/**
 * Tageslimits in aiInhaltUebersetzungLimits, gezählt je übersetztem Rezept (fail closed). Ein
 * Rezeptinhalt kostet deutlich mehr Token als ein Titel, die Grenzen sind deshalb kleiner. Der
 * Trigger zählt für alle zusammen unter `automatik`, der Backfill je Admin.
 */
const LIMIT_INHALT_AUTOMATIK = 1000;
const LIMIT_INHALT_BACKFILL_ADMIN = 3000;
const INHALT_GEMINI_TIMEOUT_MS = 90000;
const INHALT_BACKFILL_ANZAHL_STANDARD = 10;
const INHALT_BACKFILL_ANZAHL_MAX = 20;
const INHALT_MAX_PARALLEL = 3;

/**
 * Führt `arbeit` für alle Einträge aus, höchstens `maxParallel` gleichzeitig.
 * @param {Array} eintraege
 * @param {number} maxParallel
 * @param {function(*): Promise<void>} arbeit
 * @return {Promise<void>}
 */
async function mitBegrenzterParallelitaet(eintraege, maxParallel, arbeit) {
  let naechster = 0;
  const arbeiter = async () => {
    while (naechster < eintraege.length) {
      const eintrag = eintraege[naechster];
      naechster += 1;
      await arbeit(eintrag);
    }
  };
  await Promise.all(Array.from({length: Math.min(maxParallel, eintraege.length)}, arbeiter));
}

/**
 * Ein Gemini-Aufruf für den Inhalt eines Rezepts (temperature 0, JSON mit festem Schema).
 * @param {string} apiKey
 * @param {{zutaten: Array<object>, schritte: Array<object>}} anfrage
 * @param {string} id - Rezept-ID, nur für Protokolle
 * @return {Promise<object|null>} geprüftes Ergebnis aus pruefeInhaltAntwort oder null
 */
async function uebersetzeInhalt(apiKey, anfrage, id) {
  const {url, headers} = geminiGenerateContentRequest(apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INHALT_GEMINI_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{parts: [{text: baueInhaltPrompt(anfrage)}]}],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: INHALT_RESPONSE_SCHEMA,
        },
      }),
    });
    if (!response.ok) {
      console.error(`inhaltUebersetzung: Gemini antwortet ${response.status} für Rezept ${id}`);
      return null;
    }
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    let geparst;
    try {
      geparst = JSON.parse(text);
    } catch {
      console.error(`inhaltUebersetzung: keine JSON-Antwort für Rezept ${id}`);
      return null;
    }
    const ergebnis = pruefeInhaltAntwort(geparst, anfrage);
    if (!ergebnis) console.error(`inhaltUebersetzung: unvollständige Antwort für Rezept ${id}`);
    return ergebnis;
  } catch (error) {
    const art = error?.name === 'AbortError' ? 'Zeitüberschreitung' : error?.message;
    console.error(`inhaltUebersetzung: Gemini nicht erreichbar für Rezept ${id}: ${art}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Schreibt die Übersetzung nur, wenn das Rezept noch denselben Inhalt hat: In einer Transaktion
 * wird das Rezept erneut gelesen und sein quellHash verglichen.
 * @param {object} db - Firestore
 * @param {object} rezeptRef
 * @param {object} uebersetzungRef
 * @param {string} quellHash - Hash des übersetzten Inhalts
 * @param {object} dokument
 * @return {Promise<'neu'|'ueberholt'|'speichern'>}
 */
async function speichereInhalt(db, rezeptRef, uebersetzungRef, quellHash, dokument) {
  try {
    return await db.runTransaction(async (transaktion) => {
      const aktuell = await transaktion.get(rezeptRef);
      if (!aktuell.exists || inhaltQuellHash(aktuell.data()) !== quellHash) return 'ueberholt';
      transaktion.set(uebersetzungRef, dokument);
      return 'neu';
    });
  } catch (error) {
    console.error(`inhaltUebersetzung: Speichern für Rezept ${rezeptRef.id} fehlgeschlagen: ${error?.code || error?.message}`);
    return 'speichern';
  }
}

/**
 * @param {object} uebersetzungRef
 * @return {Promise<void>}
 */
async function loescheUebersetzung(uebersetzungRef) {
  try {
    await uebersetzungRef.delete();
  } catch (error) {
    console.error(`inhaltUebersetzung: Löschen für Rezept ${uebersetzungRef.id} fehlgeschlagen: ${error?.message}`);
  }
}

/**
 * Trigger: übersetzt Zutaten und Schritte eines neuen Rezepts oder nach einer Änderung am Inhalt
 * und löscht die Übersetzung mit dem Rezept.
 */
exports.uebersetzeRezeptInhalt = onDocumentWritten(
    {
      document: 'recipes/{recipeId}',
      region: 'us-central1',
      secrets: [geminiApiKey],
      memory: '256MiB',
      timeoutSeconds: 120,
      maxInstances: 5,
    },
    async (event) => {
      const vorher = event.data?.before;
      const nachher = event.data?.after;
      const id = event.params?.recipeId || nachher?.id || vorher?.id;
      const db = getFirestore();
      const uebersetzungRef = db.collection(UEBERSETZUNGEN).doc(id);

      if (!nachher?.exists) {
        if (vorher?.exists) await loescheUebersetzung(uebersetzungRef);
        return;
      }
      const rezept = nachher.data();
      if (rezept.importStatus) return;
      const quellHash = inhaltQuellHash(rezept);
      // Inhalt unverändert (Bewertung, Freigabe, Titelübersetzung …): nichts zu tun, ohne Lesezugriff.
      const vorherDaten = vorher?.exists ? vorher.data() : null;
      if (vorherDaten && !vorherDaten.importStatus && inhaltQuellHash(vorherDaten) === quellHash) return;

      const anfrage = anfrageAusRezept(rezept);
      const vorhanden = await uebersetzungRef.get();
      if (!anfrage) {
        if (vorhanden.exists) await loescheUebersetzung(uebersetzungRef);
        return;
      }
      if (vorhanden.exists && istAktuelleInhaltUebersetzung(vorhanden.data(), quellHash)) return;

      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        console.error('uebersetzeRezeptInhalt: GEMINI_API_KEY ist nicht gesetzt');
        return;
      }
      let quota;
      try {
        quota = await consumeDailyQuota(INHALT_LIMIT_COLLECTION, LIMIT_INHALT_AUTOMATIK, AUTOMATIK);
      } catch {
        return; // nicht prüfbar: fail closed, consumeDailyQuota hat schon protokolliert
      }
      if (!quota.allowed) {
        console.warn(`uebersetzeRezeptInhalt: Tageslimit erreicht, Rezept ${id} bleibt vorerst unübersetzt`);
        return;
      }

      const ergebnis = await uebersetzeInhalt(apiKey, anfrage, id);
      if (!ergebnis) return;
      const dokument = baueUebersetzungsDokument(rezept, quellHash, ergebnis, GEMINI_MODEL, Date.now());
      const stand = await speichereInhalt(db, nachher.ref, uebersetzungRef, quellHash, dokument);
      if (stand === 'ueberholt') {
        console.log(`uebersetzeRezeptInhalt: Rezept ${id} wurde inzwischen geändert, die neuere Änderung übersetzt`);
      }
    },
);

/**
 * @param {*} data - request.data des Backfills
 * @return {{cursor: (string|null), anzahl: number}}
 */
function pruefeInhaltBackfillEingabe(data) {
  const cursor = data?.cursor ?? null;
  if (cursor !== null &&
      (typeof cursor !== 'string' || !cursor.trim() || cursor.includes('/') || cursor.length > MAX_ID_LAENGE)) {
    throw new HttpsError('invalid-argument', 'cursor muss eine Rezept-ID oder null sein');
  }
  const anzahl = data?.anzahl ?? INHALT_BACKFILL_ANZAHL_STANDARD;
  if (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > INHALT_BACKFILL_ANZAHL_MAX) {
    throw new HttpsError('invalid-argument', `anzahl muss eine ganze Zahl von 1 bis ${INHALT_BACKFILL_ANZAHL_MAX} sein`);
  }
  return {cursor, anzahl};
}

/**
 * Cloud Function: Inhaltsübersetzungen für den Bestand nachtragen (nur admin).
 *
 * Eingabe: {cursor: string|null, anzahl: 1 bis 20 (Standard 10)}. Liest die nächste Seite der
 * Rezepte nach Dokument-ID ab `cursor`, überspringt Rezepte ohne Inhalt, mit laufendem Import oder
 * mit passender Übersetzung und übersetzt die übrigen, höchstens drei gleichzeitig; dazu gehören
 * Übersetzungen, bei denen Gemini früher eine andere Originalsprache als Deutsch erkannt hatte
 * (istAktuelleInhaltUebersetzung). Jedes
 * übersetzte Rezept zählt gegen das Tageslimit des Admins; ist es erreicht, endet die Seite vor
 * dem ersten Rezept, das nicht mehr übersetzt werden darf.
 *
 * Antwort wie backfillTitelUebersetzungen: {geprueft, neu, uebersprungen, fehlgeschlagen,
 * fehlerGruende, naechsterCursor, fertig, tageslimitErreicht, gesamt, remainingRequests, dailyLimit}.
 */
exports.backfillInhaltUebersetzungen = onCall(
    {
      secrets: [geminiApiKey],
      cors: ALLOWED_ORIGINS,
      invoker: 'public',
      maxInstances: 1,
      memory: '512MiB',
      timeoutSeconds: 540,
    },
    async (request) => {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Anmeldung erforderlich');
      }
      const {cursor, anzahl} = pruefeInhaltBackfillEingabe(request.data);
      const caller = await requireAiCaller(request.auth);
      if (!caller.isAdmin) {
        throw new HttpsError('permission-denied', 'Inhaltsübersetzungen nachtragen dürfen nur Admins.');
      }
      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        console.error('backfillInhaltUebersetzungen: GEMINI_API_KEY ist nicht gesetzt');
        throw new HttpsError('failed-precondition', 'Der KI-Dienst ist nicht eingerichtet.');
      }

      const db = getFirestore();
      const rezepte = db.collection('recipes');
      let abfrage = rezepte.orderBy(FieldPath.documentId()).limit(anzahl);
      if (cursor) abfrage = abfrage.startAfter(cursor);
      const [seite, gesamt] = await Promise.all([
        abfrage.get(),
        cursor ? Promise.resolve(null) : zaehleDokumente(rezepte),
      ]);

      const eintraege = seite.docs.map((snap) => {
        const rezept = snap.data() || {};
        const anfrage = rezept.importStatus ? null : anfrageAusRezept(rezept);
        return {id: snap.id, ref: snap.ref, rezept, anfrage, quellHash: anfrage ? inhaltQuellHash(rezept) : null};
      });
      const vorhandene = await Promise.all(eintraege.map((eintrag) => (
        eintrag.anfrage ? db.collection(UEBERSETZUNGEN).doc(eintrag.id).get() : null
      )));

      let remainingRequests = null;
      let tageslimitErreicht = false;
      let letzteId = cursor;
      let geprueft = 0;
      let uebersprungen = 0;
      const zuUebersetzen = [];
      for (const [index, eintrag] of eintraege.entries()) {
        const vorhanden = vorhandene[index];
        if (!eintrag.anfrage || (vorhanden?.exists && istAktuelleInhaltUebersetzung(vorhanden.data(), eintrag.quellHash))) {
          uebersprungen += 1;
        } else {
          const quota = await consumeDailyQuota(INHALT_LIMIT_COLLECTION, LIMIT_INHALT_BACKFILL_ADMIN, caller);
          if (!quota.allowed) {
            tageslimitErreicht = true;
            break;
          }
          remainingRequests = quota.remaining;
          zuUebersetzen.push(eintrag);
        }
        letzteId = eintrag.id;
        geprueft += 1;
      }

      if (tageslimitErreicht && geprueft === 0) {
        throw new HttpsError(
            'resource-exhausted',
            `Tageslimit für Inhaltsübersetzungen erreicht (${LIMIT_INHALT_BACKFILL_ADMIN}). Versuche es morgen erneut.`,
        );
      }

      let neu = 0;
      const fehlgeschlagen = [];
      const fehlerGruende = {};
      await mitBegrenzterParallelitaet(zuUebersetzen, INHALT_MAX_PARALLEL, async (eintrag) => {
        const ergebnis = await uebersetzeInhalt(apiKey, eintrag.anfrage, eintrag.id);
        if (!ergebnis) {
          fehlgeschlagen.push(eintrag.id);
          fehlerGruende[eintrag.id] = GRUND.KI;
          return;
        }
        const dokument = baueUebersetzungsDokument(eintrag.rezept, eintrag.quellHash, ergebnis, GEMINI_MODEL, Date.now());
        const uebersetzungRef = db.collection(UEBERSETZUNGEN).doc(eintrag.id);
        const stand = await speichereInhalt(db, eintrag.ref, uebersetzungRef, eintrag.quellHash, dokument);
        if (stand === 'neu') {
          neu += 1;
        } else if (stand === 'ueberholt') {
          uebersprungen += 1; // inzwischen geändert: der Trigger übersetzt den neuen Inhalt
        } else {
          fehlgeschlagen.push(eintrag.id);
          fehlerGruende[eintrag.id] = GRUND.SPEICHERN;
        }
      });

      const fertig = !tageslimitErreicht && seite.docs.length < anzahl;
      console.log(`backfillInhaltUebersetzungen: ${geprueft} geprüft, ${neu} neu, ${uebersprungen} übersprungen, ` +
        `${fehlgeschlagen.length} fehlgeschlagen${fertig ? ', fertig' : ''}`);
      return {
        geprueft,
        neu,
        uebersprungen,
        fehlgeschlagen: fehlgeschlagen.sort(),
        fehlerGruende,
        naechsterCursor: fertig ? null : letzteId,
        fertig,
        tageslimitErreicht,
        gesamt,
        remainingRequests,
        dailyLimit: LIMIT_INHALT_BACKFILL_ADMIN,
      };
    },
);

// ── Auswahllisten (PR 5, Automatik PR 6t) ─────────────────────────────────────

const LISTEN_LIMIT_COLLECTION = 'aiListenUebersetzungLimits';
/**
 * Tageslimits in aiListenUebersetzungLimits, gezählt je Gemini-Aufruf mit bis zu 100 Listenwerten
 * (fail closed): je Admin für die Vorschläge, für den Trigger gemeinsam unter `automatik`. Neue
 * Listenwerte sind selten; die Grenze des Triggers schützt vor Schleifen, nicht vor Gebrauch.
 */
const LIMIT_LISTEN_ADMIN = 100;
const LIMIT_LISTEN_AUTOMATIK = 50;
const LISTEN_GEMINI_TIMEOUT_MS = 60000;

/**
 * Ein Gemini-Aufruf für Listenwerte (temperature 0, JSON mit festem Schema).
 * @param {string} apiKey
 * @param {Array<object>} eintraege - aus pruefeListenEingabe
 * @param {string} name - Name der Function, nur für Protokolle
 * @return {Promise<Array<object>|null>} geprüfte Vorschläge (Einträge ohne gültige Antwort fehlen)
 *   oder null, wenn der KI-Dienst nicht geantwortet hat
 */
async function uebersetzeListen(apiKey, eintraege, name) {
  const {url, headers} = geminiGenerateContentRequest(apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LISTEN_GEMINI_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{parts: [{text: baueListenPrompt(eintraege)}]}],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: LISTEN_RESPONSE_SCHEMA,
        },
      }),
    });
    if (!response.ok) {
      console.error(`${name}: Gemini antwortet ${response.status}`);
      return null;
    }
    const data = await response.json();
    let geparst = null;
    try {
      geparst = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text);
    } catch {
      console.error(`${name}: keine JSON-Antwort`);
    }
    return pruefeListenAntwort(geparst, eintraege);
  } catch (error) {
    const art = error?.name === 'AbortError' ? 'Zeitüberschreitung' : error?.message;
    console.error(`${name}: Gemini nicht erreichbar: ${art}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cloud Function: Übersetzungsvorschläge für Listenwerte (nur admin).
 *
 * Eingabe: {eintraege: [{liste, wert, text?} | {liste, wert, einzahl, mehrzahl}]}, 1 bis 100.
 * Antwort: {vorschlaege: [{liste, wert, en, fr}], remainingRequests, dailyLimit}; bei Einheiten
 * sind en und fr {einzahl, mehrzahl}. Einträge ohne gültige Antwort fehlen in den Vorschlägen.
 */
exports.uebersetzeListenwerte = onCall(
    {
      secrets: [geminiApiKey],
      cors: ALLOWED_ORIGINS,
      invoker: 'public',
      maxInstances: 2,
      memory: '256MiB',
      timeoutSeconds: 90,
    },
    async (request) => {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Anmeldung erforderlich');
      }
      let eintraege;
      try {
        eintraege = pruefeListenEingabe(request.data?.eintraege);
      } catch (error) {
        throw new HttpsError('invalid-argument', error.message);
      }
      const caller = await requireAiCaller(request.auth);
      if (!caller.isAdmin) {
        throw new HttpsError('permission-denied', 'Übersetzungsvorschläge für Listen dürfen nur Admins anfordern.');
      }
      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        console.error('uebersetzeListenwerte: GEMINI_API_KEY ist nicht gesetzt');
        throw new HttpsError('failed-precondition', 'Der KI-Dienst ist nicht eingerichtet.');
      }
      const quota = await consumeDailyQuota(LISTEN_LIMIT_COLLECTION, LIMIT_LISTEN_ADMIN, caller);
      if (!quota.allowed) {
        throw new HttpsError(
            'resource-exhausted',
            `Tageslimit für Listenübersetzungen erreicht (${LIMIT_LISTEN_ADMIN}). Versuche es morgen erneut.`,
        );
      }

      const vorschlaege = await uebersetzeListen(apiKey, eintraege, 'uebersetzeListenwerte');
      if (!vorschlaege) {
        throw new HttpsError('unavailable', 'Der KI-Dienst hat nicht geantwortet. Versuche es gleich noch einmal.');
      }
      console.log(`uebersetzeListenwerte: ${vorschlaege.length} von ${eintraege.length} Vorschlägen`);
      return {vorschlaege, remainingRequests: quota.remaining, dailyLimit: LIMIT_LISTEN_ADMIN};
    },
);

/**
 * Trigger: übersetzt neue Listenwerte (Entscheidung „Listenwerte automatisch übersetzen“, PR 6t).
 *
 * Wacht nur auf, wenn sich eine Liste oder listenUebersetzungen geändert hat, und liest dann
 * settings/app frisch: Mehrere Speichervorgänge kurz hintereinander übersetzen so nicht doppelt
 * (maxInstances 1 arbeitet sie nacheinander ab). Je Lauf gehen bis zu 100 fehlende Werte in einen
 * Gemini-Aufruf; schreibt der Lauf etwas, weckt das den Trigger für den Rest erneut. Geschrieben
 * wird in einer Transaktion und nur in leere Felder (ergaenzeListenUebersetzungen): Von Hand
 * gepflegte Übersetzungen bleiben, die gefüllten Sprachen stehen in kiUngeprueft, bis jemand sie
 * unter Einstellungen › Listen & Kategorien prüft. Bringt ein Lauf nichts Neues, schreibt er nicht;
 * scheitert die KI an einem Wert, bleibt er bis zur nächsten Änderung an den Listen offen.
 */
exports.uebersetzeListenwerteAutomatisch = onDocumentWritten(
    {
      document: 'settings/app',
      region: 'us-central1',
      secrets: [geminiApiKey],
      memory: '256MiB',
      timeoutSeconds: 120,
      maxInstances: 1,
    },
    async (event) => {
      const vorher = event.data?.before;
      const nachher = event.data?.after;
      if (!nachher?.exists) return;
      if (vorher?.exists && listenStand(vorher.data()) === listenStand(nachher.data())) return;

      const db = getFirestore();
      const ref = db.collection('settings').doc('app');
      const aktuell = await ref.get();
      if (!aktuell.exists) return;
      const anfrage = fehlendeListenwerte(aktuell.data()).slice(0, MAX_LISTENWERTE_JE_AUFRUF);
      if (anfrage.length === 0) return;

      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        console.error('uebersetzeListenwerteAutomatisch: GEMINI_API_KEY ist nicht gesetzt');
        return;
      }
      let quota;
      try {
        quota = await consumeDailyQuota(LISTEN_LIMIT_COLLECTION, LIMIT_LISTEN_AUTOMATIK, AUTOMATIK);
      } catch {
        return; // nicht prüfbar: fail closed, consumeDailyQuota hat schon protokolliert
      }
      if (!quota.allowed) {
        console.warn(`uebersetzeListenwerteAutomatisch: Tageslimit erreicht, ${anfrage.length} Werte bleiben vorerst unübersetzt`);
        return;
      }

      const vorschlaege = await uebersetzeListen(apiKey, pruefeListenEingabe(anfrage), 'uebersetzeListenwerteAutomatisch');
      if (!vorschlaege?.length) return;
      try {
        const neu = await db.runTransaction(async (transaktion) => {
          const stand = await transaktion.get(ref);
          if (!stand.exists) return 0;
          const ergebnis = ergaenzeListenUebersetzungen(stand.data(), anfrage, vorschlaege);
          if (ergebnis.neu > 0) transaktion.update(ref, {listenUebersetzungen: ergebnis.listenUebersetzungen});
          return ergebnis.neu;
        });
        console.log(`uebersetzeListenwerteAutomatisch: ${anfrage.length} Werte angefragt, ${vorschlaege.length} übersetzt, ` +
          `${neu} Sprachfelder eingetragen`);
      } catch (error) {
        console.error(`uebersetzeListenwerteAutomatisch: Speichern fehlgeschlagen: ${error?.code || error?.message}`);
      }
    },
);

// ── Namen und Beschreibungen von Listen, Menüs und Events (PR 6u) ───────────

/**
 * Tageslimits in aiTitelUebersetzungLimits (wie Rezepttitel, je übersetztem Dokument, fail closed):
 * Die drei Trigger zählen gemeinsam unter einem eigenen Schlüssel, damit eine Schleife hier nicht die
 * Rezepttitel aufhält; der Backfill zählt beim Admin mit seinen Titeln zusammen.
 */
const LIMIT_TEXTE_AUTOMATIK = 1000;
const AUTOMATIK_TEXTE = {...AUTOMATIK, userId: 'automatikTexte'};
/** Reihenfolge im Backfill; der Cursor nennt die Art („menue|<id>“). */
const TEXT_ARTEN = ['liste', 'menue', 'event'];
const EVENT_PFAD = /^users\/[^/]+\/events\/[^/]+$/;

/**
 * Ein Gemini-Aufruf für Name und Beschreibung eines oder mehrerer Dokumente einer Art.
 * @param {string} apiKey
 * @param {string} art - liste, menue oder event
 * @param {Array<{name: string, description: string}>} quellen
 * @return {Promise<Array<object|null>>} je Dokument {en, fr} oder null
 */
async function uebersetzeNamen(apiKey, art, quellen) {
  const antwort = await geminiJson(apiKey, baueNamenPrompt(art, quellen), NAMEN_RESPONSE_SCHEMA,
      `namenUebersetzung (${quellen.length} × ${art})`);
  return antwort === null ? quellen.map(() => null) : pruefeNamenAntwort(antwort, quellen);
}

/**
 * Schreibt die Übersetzung an das Dokument, nur das Feld textUebersetzung, mit Vorbedingung
 * lastUpdateTime: Wurde es seit dem Lesen geändert, gewinnt die neuere Änderung.
 * @param {{pfad: string, ref: object, quelle: object, updateTime: *}} eintrag
 * @param {object} ergebnis - geprüftes Ergebnis aus uebersetzeNamen
 * @return {Promise<'neu'|'ueberholt'|'speichern'>}
 */
async function speichereNamen(eintrag, ergebnis) {
  const textUebersetzung = baueNamenUebersetzung(eintrag.quelle, ergebnis, GEMINI_MODEL, Date.now());
  try {
    if (eintrag.updateTime) {
      await eintrag.ref.update({textUebersetzung}, {lastUpdateTime: eintrag.updateTime});
    } else {
      await eintrag.ref.update({textUebersetzung});
    }
    return 'neu';
  } catch (error) {
    if (istUeberholt(error)) return 'ueberholt';
    console.error(`namenUebersetzung: Speichern für ${eintrag.pfad} fehlgeschlagen: ${error?.code || error?.message}`);
    return 'speichern';
  }
}

/**
 * Trigger einer Art: übersetzt Name und Beschreibung eines neuen Dokuments oder nach einer Änderung
 * an einem von beiden. Andere Änderungen (Rezepte, Mitglieder, Getränke) und das eigene Schreiben
 * lösen keinen KI-Aufruf aus, weil `textUebersetzung` dann schon passt.
 * @param {string} art - liste, menue oder event
 * @param {string} document - Pfadmuster des Triggers
 * @param {string} name - Name der Function, für Protokolle
 * @return {Function}
 */
function namenTrigger(art, document, name) {
  return onDocumentWritten(
      {
        document,
        region: 'us-central1',
        secrets: [geminiApiKey],
        memory: '256MiB',
        timeoutSeconds: 60,
        maxInstances: 5,
      },
      async (event) => {
        const nachher = event.data?.after;
        if (!nachher?.exists) return;
        const daten = nachher.data();
        if (!brauchtNamenUebersetzung(art, daten)) return;

        const pfad = nachher.ref?.path || nachher.id;
        const apiKey = geminiApiKey.value();
        if (!apiKey) {
          console.error(`${name}: GEMINI_API_KEY ist nicht gesetzt`);
          return;
        }
        let quota;
        try {
          quota = await consumeDailyQuota(LIMIT_COLLECTION, LIMIT_TEXTE_AUTOMATIK, AUTOMATIK_TEXTE);
        } catch {
          return; // nicht prüfbar: fail closed, consumeDailyQuota hat schon protokolliert
        }
        if (!quota.allowed) {
          console.warn(`${name}: Tageslimit erreicht, ${pfad} bleibt vorerst unübersetzt`);
          return;
        }

        const quelle = quelleAus(art, daten);
        const [ergebnis] = await uebersetzeNamen(apiKey, art, [quelle]);
        if (!ergebnis) {
          console.error(`${name}: keine gültige Übersetzung für ${pfad}`);
          return;
        }
        const stand = await speichereNamen({pfad, ref: nachher.ref, quelle, updateTime: nachher.updateTime}, ergebnis);
        if (stand === 'ueberholt') {
          console.log(`${name}: ${pfad} wurde inzwischen geändert, die neuere Änderung übersetzt`);
        }
      },
  );
}

exports.uebersetzeListenTexte = namenTrigger('liste', 'groups/{groupId}', 'uebersetzeListenTexte');
exports.uebersetzeMenueTexte = namenTrigger('menue', 'menus/{menuId}', 'uebersetzeMenueTexte');
exports.uebersetzeEventTexte = namenTrigger('event', 'users/{userId}/events/{eventId}', 'uebersetzeEventTexte');

/**
 * Cursor des Backfills: null (Anfang), „<art>|“ (Anfang einer Art) oder „<art>|<nach>“, wobei
 * <nach> die letzte Dokument-ID ist, bei Events der Pfad users/<uid>/events/<id> (Collection-Group).
 * @param {*} data - request.data des Backfills
 * @return {{art: string, nach: (string|null), anzahl: number}}
 */
function pruefeTextBackfillEingabe(data) {
  const cursor = data?.cursor ?? null;
  let art = TEXT_ARTEN[0];
  let nach = null;
  if (cursor !== null) {
    const trenner = typeof cursor === 'string' ? cursor.indexOf('|') : -1;
    art = trenner > 0 ? cursor.slice(0, trenner) : '';
    nach = trenner > 0 ? cursor.slice(trenner + 1) || null : null;
    const nachGueltig = nach === null || (nach.length <= MAX_ID_LAENGE * 2 &&
      (art === 'event' ? EVENT_PFAD.test(nach) : !nach.includes('/') && nach.trim() === nach && nach !== ''));
    if (!TEXT_ARTEN.includes(art) || !nachGueltig) {
      throw new HttpsError('invalid-argument', 'cursor muss „<liste|menue|event>|<ID>“ oder null sein');
    }
  }
  const anzahl = data?.anzahl ?? BACKFILL_ANZAHL_STANDARD;
  if (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > BACKFILL_ANZAHL_MAX) {
    throw new HttpsError('invalid-argument', `anzahl muss eine ganze Zahl von 1 bis ${BACKFILL_ANZAHL_MAX} sein`);
  }
  return {art, nach, anzahl};
}

/**
 * @param {object} db - Firestore
 * @param {string} art
 * @return {object} Collection bzw. Collection-Group der Art
 */
function textSammlung(db, art) {
  if (art === 'liste') return db.collection('groups');
  if (art === 'menue') return db.collection('menus');
  return db.collectionGroup('events');
}

/**
 * Cloud Function: Übersetzungen der Namen und Beschreibungen von Listen, Menüs und Events für den
 * Bestand nachtragen (nur admin), wie backfillTitelUebersetzungen.
 *
 * Eingabe: {cursor: string|null, anzahl: 1 bis 50 (Standard 25)}. Geht die Arten nacheinander durch
 * (Listen, Menüs, Events), je Aufruf eine Seite einer Art nach Dokument-ID bzw. Pfad ab dem Cursor.
 * Übersprungen werden die öffentliche Systemliste, Dokumente ohne Namen und solche mit passender
 * Übersetzung; die übrigen gehen mit bis zu 25 je Gemini-Aufruf an die KI. Jedes übersetzte Dokument
 * zählt gegen das Tageslimit des Admins für Titel.
 *
 * Antwort wie backfillTitelUebersetzungen; `gesamt` (nur beim ersten Aufruf) zählt alle drei Arten,
 * `naechsterCursor` nennt die Art.
 */
exports.backfillTextUebersetzungen = onCall(
    {
      secrets: [geminiApiKey],
      cors: ALLOWED_ORIGINS,
      invoker: 'public',
      maxInstances: 1,
      memory: '256MiB',
      timeoutSeconds: 300,
    },
    async (request) => {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Anmeldung erforderlich');
      }
      const {art, nach, anzahl} = pruefeTextBackfillEingabe(request.data);
      const caller = await requireAiCaller(request.auth);
      if (!caller.isAdmin) {
        throw new HttpsError('permission-denied', 'Übersetzungen von Listen, Menüs und Events nachtragen dürfen nur Admins.');
      }
      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        console.error('backfillTextUebersetzungen: GEMINI_API_KEY ist nicht gesetzt');
        throw new HttpsError('failed-precondition', 'Der KI-Dienst ist nicht eingerichtet.');
      }

      const db = getFirestore();
      const sammlung = textSammlung(db, art);
      let abfrage = sammlung.orderBy(FieldPath.documentId()).limit(anzahl);
      if (nach) abfrage = abfrage.startAfter(art === 'event' ? db.doc(nach) : nach);
      const anfang = request.data?.cursor == null;
      const [seite, gesamt] = await Promise.all([
        abfrage.get(),
        anfang ? zaehleAlleTexte(db) : Promise.resolve(null),
      ]);

      let remainingRequests = null;
      let tageslimitErreicht = false;
      let letzter = nach;
      let geprueft = 0;
      let uebersprungen = 0;
      const zuUebersetzen = [];
      for (const snap of seite.docs) {
        const daten = snap.data() || {};
        const pfad = art === 'event' ? snap.ref.path : snap.id;
        if (!brauchtNamenUebersetzung(art, daten)) {
          uebersprungen += 1;
        } else {
          const quota = await consumeDailyQuota(LIMIT_COLLECTION, LIMIT_BACKFILL_ADMIN, caller);
          if (!quota.allowed) {
            tageslimitErreicht = true;
            break;
          }
          remainingRequests = quota.remaining;
          zuUebersetzen.push({pfad, ref: snap.ref, quelle: quelleAus(art, daten), updateTime: snap.updateTime});
        }
        letzter = pfad;
        geprueft += 1;
      }

      if (tageslimitErreicht && geprueft === 0) {
        throw new HttpsError(
            'resource-exhausted',
            `Tageslimit für Titelübersetzungen erreicht (${LIMIT_BACKFILL_ADMIN}). Versuche es morgen erneut.`,
        );
      }

      let neu = 0;
      const fehlgeschlagen = [];
      const fehlerGruende = {};
      for (let start = 0; start < zuUebersetzen.length; start += MAX_NAMEN_JE_AUFRUF) {
        const block = zuUebersetzen.slice(start, start + MAX_NAMEN_JE_AUFRUF);
        const ergebnisse = await uebersetzeNamen(apiKey, art, block.map((eintrag) => eintrag.quelle));
        for (const [index, eintrag] of block.entries()) {
          const kennung = `${art}|${eintrag.pfad}`;
          if (!ergebnisse[index]) {
            fehlgeschlagen.push(kennung);
            fehlerGruende[kennung] = GRUND.KI;
            continue;
          }
          const stand = await speichereNamen(eintrag, ergebnisse[index]);
          if (stand === 'neu') {
            neu += 1;
          } else if (stand === 'ueberholt') {
            uebersprungen += 1; // inzwischen geändert: der Trigger übersetzt den neuen Stand
          } else {
            fehlgeschlagen.push(kennung);
            fehlerGruende[kennung] = GRUND.SPEICHERN;
          }
        }
      }

      const artFertig = !tageslimitErreicht && seite.docs.length < anzahl;
      const naechsteArt = TEXT_ARTEN[TEXT_ARTEN.indexOf(art) + 1];
      let naechsterCursor = `${art}|${letzter || ''}`;
      if (artFertig) naechsterCursor = naechsteArt ? `${naechsteArt}|` : null;
      const fertig = naechsterCursor === null;
      console.log(`backfillTextUebersetzungen (${art}): ${geprueft} geprüft, ${neu} neu, ${uebersprungen} übersprungen, ` +
        `${fehlgeschlagen.length} fehlgeschlagen${fertig ? ', fertig' : ''}`);
      return {
        geprueft,
        neu,
        uebersprungen,
        fehlgeschlagen,
        fehlerGruende,
        naechsterCursor,
        fertig,
        tageslimitErreicht,
        gesamt,
        remainingRequests,
        dailyLimit: LIMIT_BACKFILL_ADMIN,
      };
    },
);

/**
 * Anzahl aller Listen, Menüs und Events für die Fortschrittsanzeige; fehlt eine Zahl, fehlt die Summe.
 * @param {object} db - Firestore
 * @return {Promise<number|null>}
 */
async function zaehleAlleTexte(db) {
  const zahlen = await Promise.all(TEXT_ARTEN.map((art) => zaehleDokumente(textSammlung(db, art))));
  return zahlen.some((zahl) => typeof zahl !== 'number') ? null : zahlen.reduce((summe, zahl) => summe + zahl, 0);
}
