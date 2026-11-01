/**
 * Klangkatalog der Alarmtöne im Kochmodus.
 *
 * Reine Daten, kein Web-Audio-Code: Jeder Ton besteht aus „Stimmen“ (je ein Oszillator mit
 * Hüllkurve), die `alarmAudioUtils.js` abspielt. Einen neuen Ton legt man hier an –
 * Liste in den Einstellungen, Vorschau und Alarm-Schleife übernehmen ihn automatisch.
 *
 * Aufbau einer Stimme:
 *   at      – Anschlagzeitpunkt in s relativ zum Musterbeginn, oder
 *   hits    – mehrere Anschlagzeitpunkte: Dieselbe Stimme wird erneut angeschlagen, ihr Nachklang
 *             addiert sich (Glocke unter einem Klöppel, Piepserfolge). Ein Oszillator für alle
 *             Anschläge – nur so bleiben sie sicher in Phase und verstärken sich
 *   type    – Wellenform des Oszillators ('sine' | 'triangle' | 'square' | 'sawtooth')
 *   freq    – Frequenz in Hz; freqTo optional für einen Gleitton je Anschlag
 *   gain    – Spitzenwert je Anschlag im Verhältnis zu den anderen Stimmen des Tons
 *   attack  – Einschwingzeit in s
 *   hold    – Haltezeit auf voller Lautstärke in s (optional, Standard 0)
 *   decay   – Ausklingzeit in s (bis praktisch Stille, etwa −60 dB)
 *   curve   – 'exp' (natürliches Ausklingen, Standard) oder 'linear' (hartes Abschneiden)
 *
 * Ton:
 *   key       – wird in localStorage gespeichert; nach einer Veröffentlichung nicht mehr umbenennen
 *               (sonst `LEGACY_ALARM_SOUND_KEYS` ergänzen)
 *   label     – Anzeige in den Einstellungen
 *   repeatMs  – Abstand, in dem der Alarm das Muster wiederholt, bis „OK“ gedrückt wird
 *   voices    – Liste der Stimmen
 *
 * Die Lautstärke stellt man nicht ein: Jeder Ton wird automatisch so weit verstärkt, dass er
 * an seiner lautesten Stelle `TARGET_PEAK` erreicht, ohne zu übersteuern (`getAlarmSoundLevel`).
 * Ein Alarm muss in einer lauten Küche hörbar sein. Deshalb prüft `alarmSounds.test.js` zusätzlich
 * die mittlere Lautstärke: Angeschlagene Klänge brauchen genug Nachklang und kurze Pausen.
 *
 * Frequenzen liegen bewusst zwischen etwa 500 Hz und 6 kHz: Darunter geben Handy-Lautsprecher
 * kaum etwas wieder, darüber wird es schrill.
 */

/** Untergrenze für exponentielle Rampen: Web Audio erlaubt dort keine 0. */
export const SILENCE = 0.001;

/** Spitzenpegel, auf den jeder Ton gebracht wird (knapp unter Vollaussteuerung). */
export const TARGET_PEAK = 0.9;

/** Zeitpunkte von `count` Anschlägen im Abstand `interval`, beginnend bei `from`. */
function hitTimes(count, interval, from = 0) {
  return Array.from({ length: count }, (_, i) => from + i * interval);
}

/**
 * Küchenwecker: Der Klöppel schlägt gut 20-mal pro Sekunde gegen die Glocke, die zwischen den
 * Schlägen nachklingt – das typische „Rrrring“. Danach eine kurze Pause.
 */
const BELL_HITS = hitTimes(34, 0.045); // gut 1,5 s Klingeln
const BELL_FREQ = 2350;
const kuechenwecker = {
  key: 'kuechenwecker',
  label: 'Küchenwecker',
  repeatMs: 2100,
  voices: [
    { hits: BELL_HITS, type: 'sine', freq: BELL_FREQ, gain: 0.8, attack: 0.002, decay: 0.5 },
    // Unharmonischer Oberton – macht den metallischen Anschlag
    { hits: BELL_HITS, type: 'sine', freq: BELL_FREQ * 2.43, gain: 0.2, attack: 0.002, decay: 0.1 },
  ],
};

/** Marimba: Melodie aus dem C-Dur-Dreiklang, endet auf dem hohen C. */
const MARIMBA_NOTES = [
  { at: 0.00, freq: 523.25 }, // C5
  { at: 0.12, freq: 659.25 }, // E5
  { at: 0.24, freq: 783.99 }, // G5
  { at: 0.36, freq: 1046.5 }, // C6
  { at: 0.60, freq: 783.99 }, // G5
  { at: 0.72, freq: 1046.5, decay: 1.2 }, // C6, klingt länger aus
];
const marimba = {
  key: 'marimba',
  label: 'Marimba',
  repeatMs: 2000,
  voices: MARIMBA_NOTES.flatMap(({ at, freq, decay = 0.7 }) => [
    { at, type: 'sine', freq, gain: 0.8, attack: 0.005, decay },
    // Marimba-Klangstäbe sind auf den vierfachen Oberton gestimmt; er trägt auf Handy-Lautsprechern
    { at, type: 'sine', freq: freq * 4, gain: 0.25, attack: 0.003, decay: decay * 0.3 },
  ]),
};

/**
 * Gong: zweimal angeschlagen, mit unharmonischen Teiltönen und Nachklang. Grundton D5 – tief genug
 * für einen Gong, hoch genug, dass Handy-Lautsprecher ihn noch wiedergeben.
 */
const GONG_BASE = 587.33;
const GONG_PARTIALS = [
  { ratio: 1.0, gain: 0.8, decay: 1.6 },
  { ratio: 1.48, gain: 0.35, decay: 1.3 },
  { ratio: 2.09, gain: 0.25, decay: 1.0 },
  { ratio: 2.74, gain: 0.15, decay: 0.8 },
  { ratio: 4.12, gain: 0.08, decay: 0.5 },
];
const gong = {
  key: 'gong',
  label: 'Gong',
  repeatMs: 2800,
  voices: GONG_PARTIALS.map(({ ratio, gain, decay }) => ({
    hits: [0, 1.0], type: 'sine', freq: GONG_BASE * ratio, gain, attack: 0.008, decay,
  })),
};

/** Digitaluhr: das klassische „Piep-piep … Piep-piep“ einer Armbanduhr. */
const digitaluhr = {
  key: 'digitaluhr',
  label: 'Digitaluhr',
  repeatMs: 1000,
  voices: [
    {
      hits: [0, 0.12, 0.4, 0.52], type: 'square', freq: 2093, gain: 1,
      attack: 0.002, hold: 0.06, decay: 0.01, curve: 'linear',
    },
  ],
};

/** Zwitschern: drei schnelle, aufsteigende Vogelrufe und ein langer, fallender. */
const zwitschern = {
  key: 'zwitschern',
  label: 'Zwitschern',
  repeatMs: 1100,
  voices: [
    {
      hits: [0, 0.1, 0.2], type: 'sine', freq: 2400, freqTo: 3900, gain: 1,
      attack: 0.005, hold: 0.03, decay: 0.04,
    },
    { at: 0.34, type: 'sine', freq: 4100, freqTo: 2600, gain: 0.9, attack: 0.01, hold: 0.12, decay: 0.08 },
  ],
};

/** Alle Alarmtöne in der Reihenfolge der Auswahl in den Einstellungen. */
export const ALARM_SOUND_DEFINITIONS = [kuechenwecker, marimba, gong, digitaluhr, zwitschern];

/** Standard-Alarmton für neue Nutzer und unbekannte Schlüssel. */
export const DEFAULT_ALARM_SOUND = kuechenwecker.key;

/**
 * Schlüssel der bis Oktober 2026 verwendeten Töne → nächstliegender neuer Ton.
 * So behält, wer bewusst einen Ton gewählt hatte, einen ähnlichen Charakter.
 * Gilt auch für Timer, die noch mit altem Schlüssel in einer gespeicherten Kochsitzung stehen.
 */
export const LEGACY_ALARM_SOUND_KEYS = {
  radar: 'kuechenwecker',
  alert: 'kuechenwecker',
  beep: 'digitaluhr',
  chime: 'marimba',
  crystal: 'marimba',
};

/** Anschlagzeitpunkte einer Stimme (`hits` oder das einzelne `at`). */
export function voiceHits(voice) {
  return voice.hits || [voice.at];
}

/** Zeitpunkte eines Anschlags relativ zum Musterbeginn. */
export function hitTimesOf(voice, hit) {
  const peakAt = hit + voice.attack;
  const releaseAt = peakAt + (voice.hold || 0);
  return { start: hit, peakAt, releaseAt, end: releaseAt + voice.decay };
}

function hitEnvelopeAt(voice, hit, t) {
  const { start, peakAt, releaseAt, end } = hitTimesOf(voice, hit);
  if (t < start || t > end) return 0;
  if (t < peakAt) return SILENCE + ((voice.gain - SILENCE) * (t - start)) / voice.attack;
  if (t <= releaseAt) return voice.gain;
  const progress = (t - releaseAt) / voice.decay;
  if (voice.curve === 'linear') return voice.gain * (1 - progress);
  return voice.gain * (SILENCE / voice.gain) ** progress;
}

/**
 * Hüllkurve einer Stimme zum Zeitpunkt t: Summe der Anschläge. `alarmAudioUtils.js` plant genau
 * diese Kurve: An jedem Knickpunkt wird ihr Wert angefahren. Zwischen den Knickpunkten klingen alle
 * Anschläge mit derselben Rate aus – ihre Summe ist dann wieder eine reine Exponentialkurve.
 */
export function envelopeAt(voice, t) {
  return voiceHits(voice).reduce((sum, hit) => sum + hitEnvelopeAt(voice, hit, t), 0);
}

/** Alle Knickpunkte der Hüllkurve einer Stimme, aufsteigend und ohne Dubletten. */
export function envelopeBreakpoints(voice) {
  const times = voiceHits(voice).flatMap((hit) => Object.values(hitTimesOf(voice, hit)));
  return [...new Set(times)].sort((a, b) => a - b);
}

/**
 * Obergrenze für den Spitzenpegel eines Musters: die größte Summe der Hüllkurven aller Stimmen
 * (als ob ihre Schwingungen genau übereinanderlägen). Zwischen zwei Knickpunkten ist jede Hüllkurve
 * linear oder konvex, die Summe also auch – deshalb reicht es, die Knickpunkte zu prüfen.
 */
export function computePeakBound(voices) {
  const times = voices.flatMap(envelopeBreakpoints);
  return Math.max(...times.map((t) => voices.reduce((sum, v) => sum + envelopeAt(v, t), 0)));
}

const BY_KEY = Object.fromEntries(ALARM_SOUND_DEFINITIONS.map((s) => [s.key, s]));
const LEVEL_BY_KEY = Object.fromEntries(
  ALARM_SOUND_DEFINITIONS.map((s) => [s.key, TARGET_PEAK / computePeakBound(s.voices)]),
);

/**
 * Liefert einen gültigen Ton-Schlüssel: alte Schlüssel werden umgesetzt,
 * unbekannte oder leere fallen auf den Standard zurück.
 */
export function normalizeAlarmSoundKey(key) {
  if (key && BY_KEY[key]) return key;
  if (key && LEGACY_ALARM_SOUND_KEYS[key]) return LEGACY_ALARM_SOUND_KEYS[key];
  return DEFAULT_ALARM_SOUND;
}

/** Die vollständige Definition zu einem (auch alten oder unbekannten) Schlüssel. */
export function getAlarmSoundDefinition(key) {
  return BY_KEY[normalizeAlarmSoundKey(key)];
}

/** Verstärkung, mit der ein Ton genau `TARGET_PEAK` erreicht, ohne zu übersteuern. */
export function getAlarmSoundLevel(key) {
  return LEVEL_BY_KEY[normalizeAlarmSoundKey(key)];
}

/** Länge eines Musters in Sekunden (Ende des am spätesten ausklingenden Anschlags). */
export function getAlarmSoundDuration(key) {
  const { voices } = getAlarmSoundDefinition(key);
  return Math.max(...voices.flatMap(envelopeBreakpoints));
}
