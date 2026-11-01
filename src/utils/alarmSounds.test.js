import {
  ALARM_SOUND_DEFINITIONS,
  DEFAULT_ALARM_SOUND,
  LEGACY_ALARM_SOUND_KEYS,
  SILENCE,
  TARGET_PEAK,
  computePeakBound,
  envelopeAt,
  envelopeBreakpoints,
  normalizeAlarmSoundKey,
  getAlarmSoundDefinition,
  getAlarmSoundDuration,
  getAlarmSoundLevel,
  voiceHits,
} from './alarmSounds';
import {
  PATTERN_FADE_OUT,
  PATTERN_START_DELAY,
  playAlarmPattern,
  getAlarmRepeatMs,
  previewAlarmSound,
} from './alarmAudioUtils';
import { ALARM_SOUNDS, getAlarmSoundPreference } from './customLists';

jest.mock('../firebase', () => ({ db: {} }));

const WAVEFORMS = ['sine', 'triangle', 'square', 'sawtooth'];
const SOUNDS = ALARM_SOUND_DEFINITIONS.map((s) => [s.key, s]);

/**
 * Mittlere Lautstärke eines Tons in dBFS (RMS über einen Wiederholungszyklus), gerechnet aus den
 * Hüllkurven: Stimmen mit verschiedenen Frequenzen addieren sich in der Energie, die Anschläge einer
 * Stimme (ein Oszillator) in der Amplitude. Gegen das in Chromium gerenderte Ergebnis geprüft
 * (OfflineAudioContext, 44,1 und 48 kHz): Abweichung höchstens 0,1 dB.
 */
const MEAN_SQUARE = { sine: 0.5, triangle: 1 / 3, square: 0.7, sawtooth: 1 / 3 };
function estimateRmsDb(sound) {
  const level = getAlarmSoundLevel(sound.key);
  const dt = 0.0005;
  let energy = 0;
  sound.voices.forEach((v) => {
    const end = Math.max(...envelopeBreakpoints(v));
    for (let t = 0; t <= end; t += dt) energy += MEAN_SQUARE[v.type] * envelopeAt(v, t) ** 2 * dt;
  });
  return 10 * Math.log10((level * level * energy) / (sound.repeatMs / 1000));
}

function makeParam() {
  return {
    setValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
    cancelScheduledValues: jest.fn(),
  };
}

function makeFakeContext() {
  const oscillators = [];
  const gains = [];
  const ctx = {
    currentTime: 10,
    state: 'running',
    destination: { name: 'destination' },
    resume: jest.fn(() => Promise.resolve()),
    close: jest.fn(),
    createOscillator: jest.fn(() => {
      const osc = { frequency: makeParam(), connect: jest.fn(), start: jest.fn(), stop: jest.fn() };
      oscillators.push(osc);
      return osc;
    }),
    createGain: jest.fn(() => {
      const gain = { gain: makeParam(), connect: jest.fn(), disconnect: jest.fn() };
      gains.push(gain);
      return gain;
    }),
  };
  return { ctx, oscillators, gains };
}

const T0 = 10 + PATTERN_START_DELAY;

describe('Klangkatalog', () => {
  test('keys are unique and the default exists', () => {
    const keys = ALARM_SOUND_DEFINITIONS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain(DEFAULT_ALARM_SOUND);
  });

  test.each(SOUNDS)('%s is a well-formed sound', (key, sound) => {
    expect(sound.label).toBeTruthy();
    expect(sound.voices.length).toBeGreaterThan(0);
    sound.voices.forEach((v) => {
      expect(WAVEFORMS).toContain(v.type);
      const hits = voiceHits(v);
      expect(hits.length).toBeGreaterThan(0);
      hits.forEach((hit, i) => {
        expect(hit).toBeGreaterThanOrEqual(i ? hits[i - 1] : 0);
      });
      expect(v.freq).toBeGreaterThan(0);
      expect(v.gain).toBeGreaterThan(0);
      expect(v.attack).toBeGreaterThan(0);
      expect(v.decay).toBeGreaterThan(0);
    });
    // Das Muster darf in der Wiederholung den nächsten Durchlauf nicht überlappen
    expect(sound.repeatMs).toBeGreaterThanOrEqual(Math.ceil(getAlarmSoundDuration(key) * 1000));
  });

  test.each(SOUNDS)('%s is brought to the target peak without clipping', (key, sound) => {
    expect(getAlarmSoundLevel(key) * computePeakBound(sound.voices)).toBeCloseTo(TARGET_PEAK, 10);
  });

  // Zum Vergleich die bis Oktober 2026 verwendeten Töne (gerendert): Radar −7,3, Piepton −12,4,
  // Glockenspiel −16,8, Kristall −18,7, Alarm −19,8 dBFS. Der erste Entwurf der neuen Töne lag beim
  // Standardton bei −24 dBFS, also rund 17 dB unter dem alten Radar – das soll nicht wieder passieren.
  test.each(SOUNDS)('%s is loud enough for a noisy kitchen', (key, sound) => {
    expect(estimateRmsDb(sound)).toBeGreaterThanOrEqual(-20);
  });

  test('the default sound is about as loud as the old default (Radar, −7.3 dBFS)', () => {
    expect(estimateRmsDb(getAlarmSoundDefinition(DEFAULT_ALARM_SOUND))).toBeGreaterThanOrEqual(-10);
  });

  test('every legacy key maps to an existing sound', () => {
    Object.values(LEGACY_ALARM_SOUND_KEYS).forEach((key) => {
      expect(getAlarmSoundDefinition(key).key).toBe(key);
    });
  });

  test('normalizeAlarmSoundKey keeps current keys, maps legacy keys and falls back to the default', () => {
    expect(normalizeAlarmSoundKey('gong')).toBe('gong');
    expect(normalizeAlarmSoundKey('radar')).toBe('kuechenwecker');
    expect(normalizeAlarmSoundKey('beep')).toBe('digitaluhr');
    expect(normalizeAlarmSoundKey('chime')).toBe('marimba');
    expect(normalizeAlarmSoundKey('gibtsnicht')).toBe(DEFAULT_ALARM_SOUND);
    expect(normalizeAlarmSoundKey(null)).toBe(DEFAULT_ALARM_SOUND);
    expect(normalizeAlarmSoundKey(undefined)).toBe(DEFAULT_ALARM_SOUND);
  });
});

describe('Hüllkurven', () => {
  const pluck = { at: 0, type: 'sine', freq: 1000, gain: 0.5, attack: 0.01, hold: 0.1, decay: 0.2 };

  test('a single hit rises, holds and decays to silence', () => {
    expect(envelopeAt(pluck, -0.001)).toBe(0);
    expect(envelopeAt(pluck, 0)).toBeCloseTo(SILENCE, 10);
    expect(envelopeAt(pluck, 0.05)).toBe(0.5);
    expect(envelopeAt(pluck, 0.31)).toBeCloseTo(SILENCE, 10);
    expect(envelopeAt(pluck, 0.32)).toBe(0);
  });

  test('repeated hits of one voice add up', () => {
    const twice = { ...pluck, at: undefined, hits: [0, 0.05] };
    expect(envelopeAt(twice, 0.07)).toBeCloseTo(1.0, 10);
    const expected = [0, 0.01, 0.05, 0.06, 0.11, 0.16, 0.31, 0.36];
    const breakpoints = envelopeBreakpoints(twice);
    expect(breakpoints).toHaveLength(expected.length);
    breakpoints.forEach((t, i) => expect(t).toBeCloseTo(expected[i], 10));
  });

  test('the peak bound counts overlapping voices, not only those starting together', () => {
    const later = { ...pluck, at: 0.05 };
    expect(computePeakBound([pluck, later])).toBeCloseTo(1.0, 10);
    const afterwards = { ...pluck, at: 1 };
    expect(computePeakBound([pluck, afterwards])).toBeCloseTo(0.5, 10);
  });
});

describe('Einstellung', () => {
  afterEach(() => localStorage.clear());

  test('ALARM_SOUNDS lists every catalog sound with key and label only', () => {
    expect(ALARM_SOUNDS).toEqual(ALARM_SOUND_DEFINITIONS.map(({ key, label }) => ({ key, label })));
  });

  test('a stored legacy preference is read as the matching new sound', () => {
    localStorage.setItem('alarmSoundPreference', 'crystal');
    expect(getAlarmSoundPreference()).toBe('marimba');
  });

  test('without a stored preference the default is used', () => {
    expect(getAlarmSoundPreference()).toBe(DEFAULT_ALARM_SOUND);
  });
});

describe('playAlarmPattern', () => {
  test.each(SOUNDS)('%s schedules one oscillator per voice through a master gain', (key, sound) => {
    const { ctx, oscillators, gains } = makeFakeContext();
    playAlarmPattern(ctx, key);

    expect(oscillators).toHaveLength(sound.voices.length);
    // Gesamtlautstärke + eine Hüllkurve je Stimme
    expect(gains).toHaveLength(sound.voices.length + 1);
    const master = gains[0];
    expect(master.connect).toHaveBeenCalledWith(ctx.destination);
    expect(master.gain.setValueAtTime).toHaveBeenCalledWith(getAlarmSoundLevel(key), T0);

    sound.voices.forEach((voice, i) => {
      const osc = oscillators[i];
      const hits = voiceHits(voice);
      expect(osc.type).toBe(voice.type);
      expect(osc.start).toHaveBeenCalledWith(T0 + hits[0]);
      hits.forEach((hit) => expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(voice.freq, T0 + hit));
      expect(gains[i + 1].connect).toHaveBeenCalledWith(master);
    });
  });

  test.each(SOUNDS)('%s follows the planned envelope at every breakpoint', (key, sound) => {
    const { ctx, gains } = makeFakeContext();
    playAlarmPattern(ctx, key);

    sound.voices.forEach((voice, i) => {
      const { gain } = gains[i + 1];
      const ramps = [
        ...gain.linearRampToValueAtTime.mock.calls,
        ...gain.exponentialRampToValueAtTime.mock.calls,
      ].sort((a, b) => a[1] - b[1]);
      const [, ...breakpoints] = envelopeBreakpoints(voice);
      expect(ramps).toHaveLength(breakpoints.length);
      ramps.forEach(([value, time], j) => {
        expect(time).toBeCloseTo(T0 + breakpoints[j], 10);
        expect(value).toBeCloseTo(Math.max(envelopeAt(voice, breakpoints[j]), voice.curve === 'linear' ? 0 : SILENCE), 10);
      });
    });
  });

  test('a ringing bell decays exponentially between the strikes', () => {
    const { ctx, gains } = makeFakeContext();
    playAlarmPattern(ctx, 'kuechenwecker');
    const bell = gains[1].gain;
    expect(bell.exponentialRampToValueAtTime.mock.calls.length).toBeGreaterThan(30);
    expect(bell.linearRampToValueAtTime.mock.calls.length).toBeGreaterThan(30);
  });

  test('glide voices ramp the frequency on every hit', () => {
    const { ctx, oscillators } = makeFakeContext();
    playAlarmPattern(ctx, 'zwitschern');
    expect(oscillators[0].frequency.linearRampToValueAtTime).toHaveBeenCalledTimes(3);
    expect(oscillators[0].frequency.linearRampToValueAtTime).toHaveBeenCalledWith(3900, expect.any(Number));
  });

  test('a legacy key plays the mapped sound', () => {
    const { ctx, oscillators } = makeFakeContext();
    playAlarmPattern(ctx, 'beep');
    expect(oscillators).toHaveLength(getAlarmSoundDefinition('digitaluhr').voices.length);
  });

  test('stop() fades the pattern out at once and stops every oscillator', () => {
    const { ctx, oscillators, gains } = makeFakeContext();
    const handle = playAlarmPattern(ctx, 'gong');
    ctx.currentTime = 10.5;
    handle.stop();

    const master = gains[0].gain;
    expect(master.cancelScheduledValues).toHaveBeenCalledWith(10.5);
    expect(master.linearRampToValueAtTime).toHaveBeenCalledWith(0, 10.5 + PATTERN_FADE_OUT);
    oscillators.forEach((osc) => expect(osc.stop).toHaveBeenLastCalledWith(10.5 + PATTERN_FADE_OUT));
  });

  test('stop() keeps working when an oscillator refuses a second stop (older Safari)', () => {
    const { ctx, oscillators, gains } = makeFakeContext();
    const handle = playAlarmPattern(ctx, 'gong');
    oscillators[0].stop.mockImplementation(() => { throw new Error('InvalidStateError'); });
    expect(() => handle.stop()).not.toThrow();
    expect(gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    expect(oscillators[1].stop).toHaveBeenCalledTimes(2);
  });

  test('disconnects the master gain once every voice has ended', () => {
    const { ctx, oscillators, gains } = makeFakeContext();
    playAlarmPattern(ctx, 'gong');
    oscillators.slice(1).forEach((osc) => osc.onended());
    expect(gains[0].disconnect).not.toHaveBeenCalled();
    oscillators[0].onended();
    expect(gains[0].disconnect).toHaveBeenCalledTimes(1);
  });

  test('returns null and does not throw when the Audio API fails', () => {
    const ctx = { currentTime: 0, createGain: () => { throw new Error('nope'); } };
    expect(playAlarmPattern(ctx, 'gong')).toBeNull();
  });
});

describe('getAlarmRepeatMs', () => {
  test('returns the repeat interval of the sound, also for legacy keys', () => {
    expect(getAlarmRepeatMs('gong')).toBe(getAlarmSoundDefinition('gong').repeatMs);
    expect(getAlarmRepeatMs('radar')).toBe(getAlarmSoundDefinition('kuechenwecker').repeatMs);
  });
});

describe('previewAlarmSound', () => {
  const originalAudioContext = window.AudioContext;
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    // Offene Vorschau ausklingen lassen, damit der nächste Test mit frischem Context beginnt
    jest.runOnlyPendingTimers();
    window.AudioContext = originalAudioContext;
    jest.useRealTimers();
  });

  test('plays once and closes the context after the sound has faded out', async () => {
    const { ctx, oscillators } = makeFakeContext();
    window.AudioContext = jest.fn(() => ctx);

    await previewAlarmSound('gong');
    expect(oscillators).toHaveLength(getAlarmSoundDefinition('gong').voices.length);

    jest.advanceTimersByTime((PATTERN_START_DELAY + getAlarmSoundDuration('gong')) * 1000);
    expect(ctx.close).not.toHaveBeenCalled();
    jest.advanceTimersByTime(400);
    expect(ctx.close).toHaveBeenCalledTimes(1);
  });

  test('a new preview stops the running one and reuses its context', async () => {
    const { ctx, oscillators, gains } = makeFakeContext();
    window.AudioContext = jest.fn(() => ctx);

    await previewAlarmSound('gong');
    const gongMaster = gains[0].gain;
    await previewAlarmSound('digitaluhr');

    expect(window.AudioContext).toHaveBeenCalledTimes(1);
    expect(gongMaster.linearRampToValueAtTime).toHaveBeenCalledWith(0, 10 + PATTERN_FADE_OUT);
    expect(oscillators).toHaveLength(getAlarmSoundDefinition('gong').voices.length + 1);

    // Der Context bleibt offen, bis auch die zweite Vorschau ausgeklungen ist
    jest.advanceTimersByTime((PATTERN_START_DELAY + getAlarmSoundDuration('digitaluhr')) * 1000);
    expect(ctx.close).not.toHaveBeenCalled();
    jest.advanceTimersByTime(400);
    expect(ctx.close).toHaveBeenCalledTimes(1);
  });

  test('only the last of several quick taps plays while the context resumes', async () => {
    const { ctx, oscillators } = makeFakeContext();
    ctx.state = 'suspended';
    window.AudioContext = jest.fn(() => ctx);

    const first = previewAlarmSound('gong');
    const second = previewAlarmSound('digitaluhr');
    await Promise.all([first, second]);

    expect(oscillators).toHaveLength(getAlarmSoundDefinition('digitaluhr').voices.length);
  });
});
