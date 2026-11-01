/**
 * Klangkatalog der Alarmtöne im Kochmodus.
 *
 * Reine Daten, kein Web-Audio-Code: Jeder Ton besteht aus „Stimmen“ (einzelne Oszillatoren
 * mit Hüllkurve), die `alarmAudioUtils.js` abspielt. Einen neuen Ton legt man hier an –
 * Liste in den Einstellungen, Vorschau und Alarm-Schleife übernehmen ihn automatisch.
 *
 * Aufbau einer Stimme:
 *   at      – Startzeitpunkt in s relativ zum Musterbeginn
 *   type    – Wellenform des Oszillators ('sine' | 'triangle' | 'square' | 'sawtooth')
 *   freq    – Frequenz in Hz; freqTo optional für einen Gleitton bis zum Ende der Stimme
 *   gain    – Spitzenlautstärke (0–1, vor der Gesamtlautstärke `volume` des Tons)
 *   attack  – Einschwingzeit in s
 *   hold    – Haltezeit auf voller Lautstärke in s (optional, Standard 0)
 *   decay   – Ausklingzeit in s
 *   curve   – 'exp' (natürliches Ausklingen, Standard) oder 'linear' (hartes Abschneiden)
 *
 * Ton:
 *   key       – wird in localStorage gespeichert; nach einer Veröffentlichung nicht mehr umbenennen
 *               (sonst `LEGACY_ALARM_SOUND_KEYS` ergänzen)
 *   label     – Anzeige in den Einstellungen
 *   repeatMs  – Abstand, in dem der Alarm das Muster wiederholt, bis „OK“ gedrückt wird
 *   volume    – Gesamtlautstärke des Musters. volume × Summe der gleichzeitig einsetzenden
 *               Stimmen-gains muss ≤ 1 bleiben, sonst übersteuert der Ton (per Test geprüft)
 *   voices    – Liste der Stimmen
 *
 * Frequenzen liegen bewusst zwischen etwa 400 Hz und 4 kHz: Darunter geben Handy-Lautsprecher
 * kaum etwas wieder, darüber wird es schrill.
 */

/** Hilfsfunktion: eine Stimme pro Zeitpunkt aus `times` mit gleicher Form. */
function repeatVoice(times, voice) {
  return times.map((at) => ({ ...voice, at }));
}

/** Küchenwecker: Klöppel schlägt schnell gegen eine Metallglocke, danach kurze Pause. */
const kuechenwecker = {
  key: 'kuechenwecker',
  label: 'Küchenwecker',
  repeatMs: 1300,
  volume: 0.55,
  voices: Array.from({ length: 12 }, (_, i) => i * 0.075).flatMap((at, i) => [
    // Grundton der Glocke, abwechselnd leicht verstimmt (zwei Glockenschalen)
    { at, type: 'triangle', freq: i % 2 ? 2480 : 2350, gain: 0.8, attack: 0.002, decay: 0.09 },
    // Unharmonischer Oberton – macht den metallischen Charakter
    { at, type: 'sine', freq: i % 2 ? 6050 : 5730, gain: 0.25, attack: 0.002, decay: 0.05 },
  ]),
};

/** Marimba: weiche, aufsteigende Melodie (C-Dur-Dreiklang bis zur Oktave). */
const MARIMBA_NOTES = [
  { at: 0.00, freq: 523.25 }, // C5
  { at: 0.13, freq: 659.25 }, // E5
  { at: 0.26, freq: 783.99 }, // G5
  { at: 0.39, freq: 1046.5, decay: 0.9 }, // C6, klingt länger aus
];
const marimba = {
  key: 'marimba',
  label: 'Marimba',
  repeatMs: 1700,
  volume: 0.7,
  voices: MARIMBA_NOTES.flatMap(({ at, freq, decay = 0.4 }) => [
    { at, type: 'sine', freq, gain: 0.8, attack: 0.005, decay },
    // Marimba-Klangstäbe sind auf den vierfachen Oberton gestimmt
    { at, type: 'sine', freq: freq * 4, gain: 0.12, attack: 0.003, decay: decay * 0.25 },
  ]),
};

/** Gong: ein tiefer Schlag mit unharmonischen Teiltönen und langem Nachklang. */
const GONG_PARTIALS = [
  { ratio: 1.0, gain: 0.7, decay: 2.4 },
  { ratio: 1.48, gain: 0.45, decay: 1.9 },
  { ratio: 2.09, gain: 0.35, decay: 1.4 },
  { ratio: 2.74, gain: 0.25, decay: 1.0 },
  { ratio: 4.12, gain: 0.12, decay: 0.6 },
];
const gong = {
  key: 'gong',
  label: 'Gong',
  repeatMs: 2600,
  volume: 0.45,
  voices: GONG_PARTIALS.map(({ ratio, gain, decay }) => ({
    at: 0, type: 'sine', freq: 440 * ratio, gain, attack: 0.008, decay,
  })),
};

/** Digitaluhr: das klassische „Piep-piep … Piep-piep“ einer Armbanduhr. */
const digitaluhr = {
  key: 'digitaluhr',
  label: 'Digitaluhr',
  repeatMs: 1000,
  volume: 0.45,
  voices: repeatVoice([0, 0.12, 0.4, 0.52], {
    type: 'square', freq: 2093, gain: 0.8, attack: 0.002, hold: 0.06, decay: 0.01, curve: 'linear',
  }),
};

/** Zwitschern: drei schnelle, aufsteigende Vogelrufe und ein langer, fallender. */
const zwitschern = {
  key: 'zwitschern',
  label: 'Zwitschern',
  repeatMs: 1500,
  volume: 0.6,
  voices: [
    ...repeatVoice([0, 0.1, 0.2], {
      type: 'sine', freq: 2400, freqTo: 3900, gain: 0.8, attack: 0.005, hold: 0.03, decay: 0.04,
    }),
    { at: 0.34, type: 'sine', freq: 4100, freqTo: 2600, gain: 0.7, attack: 0.01, hold: 0.12, decay: 0.08 },
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

const BY_KEY = Object.fromEntries(ALARM_SOUND_DEFINITIONS.map((s) => [s.key, s]));

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

/** Länge eines Musters in Sekunden (Ende der am spätesten ausklingenden Stimme). */
export function getAlarmSoundDuration(key) {
  const { voices } = getAlarmSoundDefinition(key);
  return Math.max(...voices.map((v) => v.at + v.attack + (v.hold || 0) + v.decay));
}
