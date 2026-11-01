import { getAlarmSoundDefinition, getAlarmSoundDuration } from './alarmSounds';

// Untergrenze für exponentielle Rampen: Web Audio erlaubt dort keine 0
const SILENCE = 0.0001;

/**
 * Spielt eine Stimme (Oszillator + Hüllkurve) eines Alarmtons ab.
 * @param {AudioContext} ctx
 * @param {AudioNode} output - Ziel (Gesamtlautstärke des Musters)
 * @param {object} voice - siehe Aufbau in `alarmSounds.js`
 * @param {number} t0 - Startzeit des Musters (ctx.currentTime)
 */
function playVoice(ctx, output, voice, t0) {
  const { type, freq, freqTo, gain: peak, attack, hold = 0, decay, curve = 'exp' } = voice;
  const start = t0 + voice.at;
  const peakAt = start + attack;
  const releaseAt = peakAt + hold;
  const end = releaseAt + decay;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (freqTo) osc.frequency.linearRampToValueAtTime(freqTo, end);

  gain.gain.setValueAtTime(SILENCE, start);
  gain.gain.linearRampToValueAtTime(peak, peakAt);
  gain.gain.setValueAtTime(peak, releaseAt);
  if (curve === 'linear') {
    gain.gain.linearRampToValueAtTime(0, end);
  } else {
    gain.gain.exponentialRampToValueAtTime(SILENCE, end);
  }

  osc.connect(gain);
  gain.connect(output);
  osc.start(start);
  osc.stop(end + 0.02);
}

/**
 * Spielt das Muster eines Alarmtons einmal ab.
 * Unbekannte und alte Schlüssel spielen den passenden bzw. den Standardton.
 */
export function playAlarmPattern(ctx, soundKey) {
  try {
    const sound = getAlarmSoundDefinition(soundKey);
    const t0 = ctx.currentTime;
    // Gemeinsame Gesamtlautstärke je Muster: überlagerte Stimmen übersteuern nicht
    const master = ctx.createGain();
    master.gain.setValueAtTime(sound.volume, t0);
    master.connect(ctx.destination);
    sound.voices.forEach((voice) => playVoice(ctx, master, voice, t0));
  } catch (_) {
    // Audio API nicht verfügbar – ignorieren
  }
}

/** Abstand in ms, in dem der Alarm das Muster des Tons wiederholt. */
export function getAlarmRepeatMs(soundKey) {
  return getAlarmSoundDefinition(soundKey).repeatMs;
}

/** Spielt den Ton einmal in einem eigenen, danach geschlossenen AudioContext (Vorschau in den Einstellungen). */
export async function previewAlarmSound(soundKey) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    playAlarmPattern(ctx, soundKey);
    // Context erst schließen, wenn das Muster ganz ausgeklungen ist
    const closeAfterMs = Math.ceil(getAlarmSoundDuration(soundKey) * 1000) + 300;
    setTimeout(() => { try { ctx.close(); } catch (_) {} }, closeAfterMs);
  } catch (_) {
    // Audio API nicht verfügbar – ignorieren
  }
}
