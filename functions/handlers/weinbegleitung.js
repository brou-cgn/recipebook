/**
 * Weinbegleitung (Tracker docs/vorhaben/weinbegleitung.md): Gericht-Profile per Gemini.
 *
 * generateWeinprofile schätzt für bis zu 20 Rezepte ein Geschmacksprofil (nur Werte
 * aus festen Listen, nie Weinnamen) und schreibt es als Feld `weinprofil` an das
 * Rezept. Rezepte, deren Inhalt sich seit dem letzten Profil nicht geändert hat
 * (gleicher inputHash), werden übersprungen und kosten nichts. Die Empfehlung selbst
 * rechnet der Client aus Profil und Wissensbasis (src/utils/weinbegleitung/).
 *
 * backfillWeinprofile (nur admin) trägt Profile für den Bestand nach: seitenweise
 * über die Dokument-ID mit Cursor, damit jeder Aufruf dort weitermacht, wo der
 * letzte aufgehört hat (anders als backfillRecipeThumbnails, Tech-Check F20).
 */

const {onCall, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const {requireAiCaller} = require('../shared/auth');
const {ALLOWED_ORIGINS} = require('../shared/common');
const {consumeDailyQuota} = require('../shared/rateLimit');
const {geminiApiKey} = require('../shared/secrets');
const {GEMINI_MODEL, geminiGenerateContentRequest} = require('../shared/geminiConfig');
const {isVisibleToUser} = require('../fuerDichEntdecktRotation');
const {
  SCHEMA_VERSION,
  WEINPROFIL_RESPONSE_SCHEMA,
  weinprofilInputHash,
  pruefeWeinprofilWerte,
  istAktuellesWeinprofil,
  baueWeinprofilPrompt,
} = require('../shared/weinprofil');

/** Höchstens so viele Rezepte je Aufruf; der Client teilt größere Mengen auf. */
const MAX_REZEPTE_JE_AUFRUF = 20;
/** Gleichzeitige Gemini-Aufrufe je Function-Aufruf. */
const MAX_PARALLEL = 4;
const GEMINI_TIMEOUT_MS = 30000;
const MAX_ID_LAENGE = 200;
/** Backfill: Rezepte je Aufruf (Standard und Obergrenze), damit ein Aufruf im Zeitlimit bleibt. */
const BACKFILL_ANZAHL_STANDARD = 20;
const BACKFILL_ANZAHL_MAX = 40;

/**
 * Tageslimit je Person in aiWeinprofilLimits, Grenzen wie aiNutritionLimits. Gezählt
 * wird jedes Rezept, das Gemini schätzt; übersprungene Rezepte zählen nicht. Gäste 0:
 * requireAiCaller lehnt sie ohnehin ab, das hält die Tabelle geschlossen.
 */
const RATE_LIMITS_WEINPROFIL = {
  admin: 5000,
  moderator: 1000,
  authenticated: 500,
  guest: 0,
};
const LIMIT_COLLECTION = 'aiWeinprofilLimits';

/** Gründe in fehlerGruende der Antwort. */
const GRUND = {
  NICHT_GEFUNDEN: 'nichtGefunden',
  KEIN_ZUGRIFF: 'keinZugriff',
  TAGESLIMIT: 'tageslimit',
  KI_FEHLER: 'kiFehler',
  KI_UNGUELTIG: 'kiUngueltig',
  SPEICHERN: 'speichern',
};

/**
 * @param {*} wert - request.data.recipeIds
 * @return {string[]} geprüfte, eindeutige IDs
 */
function pruefeRecipeIds(wert) {
  if (!Array.isArray(wert) || wert.length === 0 || wert.length > MAX_REZEPTE_JE_AUFRUF) {
    throw new HttpsError(
        'invalid-argument',
        `recipeIds muss ein Array mit 1 bis ${MAX_REZEPTE_JE_AUFRUF} IDs sein`,
    );
  }
  const ids = wert.map((id) => (typeof id === 'string' ? id.trim() : ''));
  if (ids.some((id) => !id || id.includes('/') || id.length > MAX_ID_LAENGE)) {
    throw new HttpsError('invalid-argument', 'recipeIds enthält eine ungültige ID');
  }
  return [...new Set(ids)];
}

/**
 * @param {{isAdmin: boolean, isModerator: boolean, isAuthenticated: boolean}} caller
 * @return {number}
 */
const limitFuer = (caller) => (caller.isAdmin ? RATE_LIMITS_WEINPROFIL.admin
  : caller.isModerator ? RATE_LIMITS_WEINPROFIL.moderator
  : caller.isAuthenticated ? RATE_LIMITS_WEINPROFIL.authenticated
  : RATE_LIMITS_WEINPROFIL.guest);

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
 * Ein Gemini-Aufruf für ein Rezept (temperature 0, JSON mit festem Schema).
 * Fehler beenden nicht den ganzen Aufruf, sondern nur dieses Rezept.
 * @param {string} apiKey
 * @param {object} rezept - Rezept mit id
 * @return {Promise<{profil?: object, grund?: string}>}
 */
async function schaetzeWeinprofil(apiKey, rezept) {
  const {url, headers} = geminiGenerateContentRequest(apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{parts: [{text: baueWeinprofilPrompt(rezept)}]}],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: WEINPROFIL_RESPONSE_SCHEMA,
        },
      }),
    });
    if (!response.ok) {
      console.error(`weinprofil: Gemini antwortet ${response.status} für Rezept ${rezept.id}`);
      return {grund: GRUND.KI_FEHLER};
    }
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    let geparst;
    try {
      geparst = JSON.parse(text);
    } catch {
      console.error(`weinprofil: keine JSON-Antwort für Rezept ${rezept.id}`);
      return {grund: GRUND.KI_UNGUELTIG};
    }
    const profil = pruefeWeinprofilWerte(geparst);
    if (!profil) {
      console.error(`weinprofil: Antwort außerhalb der Listen für Rezept ${rezept.id}`);
      return {grund: GRUND.KI_UNGUELTIG};
    }
    return {profil};
  } catch (error) {
    const art = error?.name === 'AbortError' ? 'Zeitüberschreitung' : error?.message;
    console.error(`weinprofil: Gemini nicht erreichbar für Rezept ${rezept.id}: ${art}`);
    return {grund: GRUND.KI_FEHLER};
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Schätzt ein Rezept und schreibt das Profil an das Rezept: nur das Feld weinprofil,
 * updatedAt bleibt, damit das Rezept nicht als geändert gilt.
 * @param {string} apiKey
 * @param {{id: string, rezept: object, inputHash: string, ref: object}} eintrag
 * @return {Promise<{profil?: object, grund?: string}>}
 */
async function schaetzeUndSpeichere(apiKey, eintrag) {
  const ergebnis = await schaetzeWeinprofil(apiKey, eintrag.rezept);
  if (!ergebnis.profil) return {grund: ergebnis.grund};
  const weinprofil = {
    ...ergebnis.profil,
    inputHash: eintrag.inputHash,
    modell: GEMINI_MODEL,
    schemaVersion: SCHEMA_VERSION,
    erstelltAm: Date.now(),
  };
  try {
    await eintrag.ref.update({weinprofil});
    return {profil: weinprofil};
  } catch (error) {
    console.error(`weinprofil: Speichern für Rezept ${eintrag.id} fehlgeschlagen: ${error?.code || error?.message}`);
    return {grund: GRUND.SPEICHERN};
  }
}

/**
 * Cloud Function: Gericht-Profile für die Weinbegleitung schätzen.
 *
 * Eingabe: {recipeIds: string[]} (1 bis 20). Rolle ab edit (requireAiCaller), nur
 * Rezepte, die die Person sehen darf (isVisibleToUser wie in der App).
 *
 * Antwort: {profile: {recipeId: weinprofil}, uebersprungen: string[],
 * fehlgeschlagen: string[], fehlerGruende: {recipeId: grund}, remainingRequests, dailyLimit}.
 * `profile` enthält auch die übersprungenen, schon aktuellen Profile.
 */
exports.generateWeinprofile = onCall(
    {
      secrets: [geminiApiKey],
      cors: ALLOWED_ORIGINS,
      invoker: 'public',
      maxInstances: 5,
      memory: '256MiB',
      timeoutSeconds: 120,
    },
    async (request) => {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Anmeldung erforderlich');
      }
      const recipeIds = pruefeRecipeIds(request.data?.recipeIds);
      const caller = await requireAiCaller(request.auth);

      const db = admin.firestore();
      const snaps = await Promise.all(recipeIds.map((id) => db.collection('recipes').doc(id).get()));

      // Gruppen nur für die Sichtbarkeitsprüfung laden; Admins sehen alles.
      const groupIds = caller.isAdmin ? [] : [...new Set(snaps
          .filter((snap) => snap.exists)
          .map((snap) => snap.data()?.groupId)
          .filter((groupId) => typeof groupId === 'string' && groupId && !groupId.includes('/')))];
      const groupSnaps = await Promise.all(groupIds.map((groupId) => db.collection('groups').doc(groupId).get()));
      const groupsById = new Map(groupSnaps
          .filter((snap) => snap.exists)
          .map((snap) => [snap.id, snap.data() || {}]));
      const nutzer = {id: caller.userId, isAdmin: caller.isAdmin};

      const profile = {};
      const uebersprungen = [];
      const fehlgeschlagen = [];
      const fehlerGruende = {};
      const fehler = (id, grund) => {
        fehlgeschlagen.push(id);
        fehlerGruende[id] = grund;
      };

      const zuSchaetzen = [];
      snaps.forEach((snap, index) => {
        const id = recipeIds[index];
        if (!snap.exists) {
          fehler(id, GRUND.NICHT_GEFUNDEN);
          return;
        }
        const rezept = {id, ...snap.data()};
        if (!isVisibleToUser(rezept, nutzer, groupsById)) {
          fehler(id, GRUND.KEIN_ZUGRIFF);
          return;
        }
        const inputHash = weinprofilInputHash(rezept);
        if (istAktuellesWeinprofil(rezept.weinprofil, inputHash)) {
          profile[id] = rezept.weinprofil;
          uebersprungen.push(id);
          return;
        }
        zuSchaetzen.push({id, rezept, inputHash, ref: snap.ref});
      });

      const limit = limitFuer(caller);
      let remainingRequests = null;
      if (zuSchaetzen.length > 0) {
        const apiKey = geminiApiKey.value();
        if (!apiKey) {
          console.error('generateWeinprofile: GEMINI_API_KEY ist nicht gesetzt');
          throw new HttpsError('failed-precondition', 'Der KI-Dienst ist nicht eingerichtet.');
        }

        // Tageslimit je Rezept, vor dem Gemini-Aufruf (fail closed: ein nicht prüfbarer
        // Zähler wirft in consumeDailyQuota und beendet den Aufruf).
        const erlaubt = [];
        for (const eintrag of zuSchaetzen) {
          const quota = await consumeDailyQuota(LIMIT_COLLECTION, limit, caller);
          if (!quota.allowed) break;
          remainingRequests = quota.remaining;
          erlaubt.push(eintrag);
        }
        zuSchaetzen.slice(erlaubt.length).forEach((eintrag) => fehler(eintrag.id, GRUND.TAGESLIMIT));

        if (erlaubt.length === 0 && uebersprungen.length === 0) {
          throw new HttpsError(
              'resource-exhausted',
              `Tageslimit für Wein-Einschätzungen erreicht (${limit}/${limit}). Versuche es morgen erneut.`,
          );
        }

        await mitBegrenzterParallelitaet(erlaubt, MAX_PARALLEL, async (eintrag) => {
          const {profil, grund} = await schaetzeUndSpeichere(apiKey, eintrag);
          if (profil) profile[eintrag.id] = profil;
          else fehler(eintrag.id, grund);
        });
      }

      return {
        profile,
        uebersprungen,
        fehlgeschlagen,
        fehlerGruende,
        remainingRequests,
        dailyLimit: limit,
      };
    },
);

/**
 * @param {*} data - request.data des Backfills
 * @return {{cursor: (string|null), anzahl: number}}
 */
function pruefeBackfillEingabe(data) {
  const cursor = data?.cursor ?? null;
  if (cursor !== null &&
      (typeof cursor !== 'string' || !cursor.trim() || cursor.includes('/') || cursor.length > MAX_ID_LAENGE)) {
    throw new HttpsError('invalid-argument', 'cursor muss eine Rezept-ID oder null sein');
  }
  const anzahl = data?.anzahl ?? BACKFILL_ANZAHL_STANDARD;
  if (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > BACKFILL_ANZAHL_MAX) {
    throw new HttpsError('invalid-argument', `anzahl muss eine ganze Zahl von 1 bis ${BACKFILL_ANZAHL_MAX} sein`);
  }
  return {cursor, anzahl};
}

/**
 * Anzahl aller Rezepte über eine Zählabfrage (liest keine Dokumente). Nur für die
 * Fortschrittsanzeige; scheitert sie, fehlt die Gesamtzahl einfach.
 * @param {object} rezepte - Collection-Referenz
 * @return {Promise<number|null>}
 */
async function zaehleRezepte(rezepte) {
  try {
    const snap = await rezepte.count().get();
    return snap.data().count;
  } catch (error) {
    console.warn(`backfillWeinprofile: Zählen der Rezepte fehlgeschlagen: ${error?.message}`);
    return null;
  }
}

/**
 * Cloud Function: Gericht-Profile für den Bestand nachtragen (nur admin).
 *
 * Eingabe: {cursor: string|null, anzahl: 1 bis 40 (Standard 20)}. Liest die nächste Seite
 * der Rezepte nach Dokument-ID ab `cursor`, überspringt Rezepte mit aktuellem Profil
 * (kein KI-Aufruf, kein Limit) und schätzt die übrigen wie generateWeinprofile; jedes
 * geschätzte Rezept zählt gegen das Tageslimit (aiWeinprofilLimits). Ist das Limit
 * erreicht, endet die Seite vor dem ersten Rezept, das nicht mehr geschätzt werden darf;
 * der Cursor zeigt auf das letzte bearbeitete Rezept, ein späterer Aufruf macht dort weiter.
 *
 * Antwort: {geprueft, neu, uebersprungen, fehlgeschlagen: string[], fehlerGruende,
 * naechsterCursor (null wenn fertig), fertig, tageslimitErreicht, gesamt (nur beim ersten
 * Aufruf ohne Cursor), remainingRequests, dailyLimit}. Fehlgeschlagene Rezepte behalten
 * kein neues Profil und werden bei einem neuen Durchlauf erneut versucht.
 */
exports.backfillWeinprofile = onCall(
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
        throw new HttpsError('permission-denied', 'Weinprofile nachtragen dürfen nur Admins.');
      }
      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        console.error('backfillWeinprofile: GEMINI_API_KEY ist nicht gesetzt');
        throw new HttpsError('failed-precondition', 'Der KI-Dienst ist nicht eingerichtet.');
      }

      const rezepte = admin.firestore().collection('recipes');
      let abfrage = rezepte.orderBy(admin.firestore.FieldPath.documentId()).limit(anzahl);
      if (cursor) abfrage = abfrage.startAfter(cursor);
      const [seite, gesamt] = await Promise.all([
        abfrage.get(),
        cursor ? Promise.resolve(null) : zaehleRezepte(rezepte),
      ]);

      const limit = limitFuer(caller);
      let remainingRequests = null;
      let tageslimitErreicht = false;
      let letzteId = cursor;
      let geprueft = 0;
      let uebersprungen = 0;
      const zuSchaetzen = [];
      for (const snap of seite.docs) {
        const rezept = {id: snap.id, ...snap.data()};
        const inputHash = weinprofilInputHash(rezept);
        if (istAktuellesWeinprofil(rezept.weinprofil, inputHash)) {
          uebersprungen += 1;
        } else {
          // Tageslimit vor dem Gemini-Aufruf (fail closed wie generateWeinprofile).
          const quota = await consumeDailyQuota(LIMIT_COLLECTION, limit, caller);
          if (!quota.allowed) {
            tageslimitErreicht = true;
            break;
          }
          remainingRequests = quota.remaining;
          zuSchaetzen.push({id: snap.id, rezept, inputHash, ref: snap.ref});
        }
        letzteId = snap.id;
        geprueft += 1;
      }

      if (tageslimitErreicht && geprueft === 0) {
        throw new HttpsError(
            'resource-exhausted',
            `Tageslimit für Wein-Einschätzungen erreicht (${limit}/${limit}). Versuche es morgen erneut.`,
        );
      }

      let neu = 0;
      const fehlgeschlagen = [];
      const fehlerGruende = {};
      await mitBegrenzterParallelitaet(zuSchaetzen, MAX_PARALLEL, async (eintrag) => {
        const {profil, grund} = await schaetzeUndSpeichere(apiKey, eintrag);
        if (profil) {
          neu += 1;
        } else {
          fehlgeschlagen.push(eintrag.id);
          fehlerGruende[eintrag.id] = grund;
        }
      });

      const fertig = !tageslimitErreicht && seite.docs.length < anzahl;
      console.log(`backfillWeinprofile: ${geprueft} geprüft, ${neu} neu, ${uebersprungen} übersprungen, ` +
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
        dailyLimit: limit,
      };
    },
);
