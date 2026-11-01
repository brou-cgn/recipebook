import {
  SILENCE,
  envelopeAt,
  envelopeBreakpoints,
  getAlarmSoundDefinition,
  getAlarmSoundDuration,
  getAlarmSoundLevel,
  hitTimesOf,
  voiceHits,
} from './alarmSounds';

/**
 * Vorlauf in s, mit dem ein Muster geplant wird: Ereignisse genau auf `currentTime` können
 * auf langsamen Geräten schon vorbei sein, wenn der Audio-Thread sie liest (Knacken, fehlender Anschlag).
 */
export const PATTERN_START_DELAY = 0.02;

/** Ausblendzeit in s, wenn ein laufendes Muster abgebrochen wird (kurz genug für „sofort“, ohne Knacken). */
export const PATTERN_FADE_OUT = 0.06;

/**
 * Spielt eine Stimme (ein Oszillator + Hüllkurve, auch bei mehreren Anschlägen) eines Alarmtons ab.
 * Die Hüllkurve fährt an jedem Knickpunkt den Wert aus `envelopeAt` an: aufwärts linear (Anschlag),
 * abwärts exponentiell (Ausklingen) bzw. linear bei `curve: 'linear'`.
 * @param {AudioContext} ctx
 * @param {AudioNode} output - Ziel (Gesamtlautstärke des Musters)
 * @param {object} voice - siehe Aufbau in `alarmSounds.js`
 * @param {number} t0 - Startzeit des Musters (Zeitachse des AudioContext)
 * @returns {OscillatorNode}
 */
function playVoice(ctx, output, voice, t0) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = voice.type;
  voiceHits(voice).forEach((hit) => {
    const { start, end } = hitTimesOf(voice, hit);
    osc.frequency.setValueAtTime(voice.freq, t0 + start);
    if (voice.freqTo) osc.frequency.linearRampToValueAtTime(voice.freqTo, t0 + end);
  });

  const [first, ...rest] = envelopeBreakpoints(voice);
  gain.gain.setValueAtTime(SILENCE, t0 + first);
  let previous = SILENCE;
  rest.forEach((t) => {
    const value = envelopeAt(voice, t);
    if (value >= previous || voice.curve === 'linear') {
      gain.gain.linearRampToValueAtTime(value, t0 + t);
    } else {
      gain.gain.exponentialRampToValueAtTime(Math.max(value, SILENCE), t0 + t);
    }
    previous = value;
  });

  osc.connect(gain);
  gain.connect(output);
  osc.start(t0 + first);
  osc.stop(t0 + rest[rest.length - 1] + 0.02);
  return osc;
}

/**
 * Spielt das Muster eines Alarmtons einmal ab.
 * Unbekannte und alte Schlüssel spielen den passenden bzw. den Standardton.
 * @returns {{ stop: () => void } | null} Griff zum sofortigen Abbrechen (kurz ausgeblendet),
 *   `null`, wenn die Audio API nicht verfügbar ist
 */
export function playAlarmPattern(ctx, soundKey) {
  try {
    const sound = getAlarmSoundDefinition(soundKey);
    const level = getAlarmSoundLevel(soundKey);
    const t0 = ctx.currentTime + PATTERN_START_DELAY;
    // Gemeinsame Gesamtlautstärke je Muster; darüber lässt es sich auch abbrechen
    const master = ctx.createGain();
    master.gain.setValueAtTime(level, t0);
    master.connect(ctx.destination);
    const oscillators = sound.voices.map((voice) => playVoice(ctx, master, voice, t0));

    // Nach der letzten Stimme vom Ausgang trennen, damit ein langer Alarm keine Knoten ansammelt
    let playing = oscillators.length;
    oscillators.forEach((osc) => {
      osc.onended = () => {
        playing -= 1;
        if (playing === 0) {
          try { master.disconnect(); } catch (_) { /* schon getrennt */ }
        }
      };
    });

    return {
      stop() {
        try {
          const now = ctx.currentTime;
          master.gain.cancelScheduledValues(now);
          master.gain.setValueAtTime(level, now);
          master.gain.linearRampToValueAtTime(0, now + PATTERN_FADE_OUT);
          oscillators.forEach((osc) => {
            // Ältere Safari-Versionen werfen bei einem zweiten stop(); die Ausblendung reicht dann
            try { osc.stop(now + PATTERN_FADE_OUT); } catch (_) { /* ignorieren */ }
          });
        } catch (_) {
          // Audio API nicht verfügbar – ignorieren
        }
      },
    };
  } catch (_) {
    // Audio API nicht verfügbar – ignorieren
    return null;
  }
}

/** Abstand in ms, in dem der Alarm das Muster des Tons wiederholt. */
export function getAlarmRepeatMs(soundKey) {
  return getAlarmSoundDefinition(soundKey).repeatMs;
}

// Vorschau in den Einstellungen: ein gemeinsamer AudioContext, immer nur ein Ton zugleich
let preview = null;

/**
 * Spielt den Ton einmal zur Vorschau. Eine laufende Vorschau bricht dabei ab, sodass sich beim
 * Durchtippen der Liste keine Töne überlagern. Der AudioContext wird weiterverwendet und erst
 * geschlossen, wenn die letzte Vorschau ausgeklungen ist.
 */
export async function previewAlarmSound(soundKey) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (preview) {
      clearTimeout(preview.closeTimer);
      if (preview.handle) preview.handle.stop();
    }
    const ctx = preview && preview.ctx.state !== 'closed' ? preview.ctx : new AudioCtx();
    const current = { ctx, handle: null, closeTimer: null };
    preview = current;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    // Während des Wartens wurde schon der nächste Ton angetippt
    if (preview !== current) return;
    current.handle = playAlarmPattern(ctx, soundKey);
    const closeAfterMs = Math.ceil((PATTERN_START_DELAY + getAlarmSoundDuration(soundKey)) * 1000) + 300;
    current.closeTimer = setTimeout(() => {
      if (preview === current) preview = null;
      try { ctx.close(); } catch (_) { /* ignorieren */ }
    }, closeAfterMs);
  } catch (_) {
    // Audio API nicht verfügbar – ignorieren
  }
}
