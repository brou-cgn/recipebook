import {
  ALARM_SOUND_DEFINITIONS,
  DEFAULT_ALARM_SOUND,
  LEGACY_ALARM_SOUND_KEYS,
  normalizeAlarmSoundKey,
  getAlarmSoundDefinition,
  getAlarmSoundDuration,
} from './alarmSounds';
import { playAlarmPattern, getAlarmRepeatMs, previewAlarmSound } from './alarmAudioUtils';
import { ALARM_SOUNDS, getAlarmSoundPreference } from './customLists';

jest.mock('../firebase', () => ({ db: {} }));

const WAVEFORMS = ['sine', 'triangle', 'square', 'sawtooth'];

function makeParam() {
  return {
    setValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
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
      const gain = { gain: makeParam(), connect: jest.fn() };
      gains.push(gain);
      return gain;
    }),
  };
  return { ctx, oscillators, gains };
}

describe('Klangkatalog', () => {
  test('keys are unique and the default exists', () => {
    const keys = ALARM_SOUND_DEFINITIONS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain(DEFAULT_ALARM_SOUND);
  });

  test.each(ALARM_SOUND_DEFINITIONS.map((s) => [s.key, s]))('%s is a well-formed sound', (_, sound) => {
    expect(sound.label).toBeTruthy();
    expect(sound.volume).toBeGreaterThan(0);
    expect(sound.volume).toBeLessThanOrEqual(1);
    expect(sound.voices.length).toBeGreaterThan(0);
    sound.voices.forEach((v) => {
      expect(WAVEFORMS).toContain(v.type);
      expect(v.at).toBeGreaterThanOrEqual(0);
      expect(v.freq).toBeGreaterThan(0);
      expect(v.gain).toBeGreaterThan(0);
      expect(v.attack).toBeGreaterThan(0);
      expect(v.decay).toBeGreaterThan(0);
    });
    // Das Muster darf in der Wiederholung den nächsten Durchlauf nicht überlappen
    expect(sound.repeatMs).toBeGreaterThanOrEqual(Math.ceil(getAlarmSoundDuration(sound.key) * 1000));
  });

  test.each(ALARM_SOUND_DEFINITIONS.map((s) => [s.key, s]))('%s does not clip when voices start together', (_, sound) => {
    const sumByStart = {};
    sound.voices.forEach((v) => { sumByStart[v.at] = (sumByStart[v.at] || 0) + v.gain; });
    Object.values(sumByStart).forEach((sum) => expect(sound.volume * sum).toBeLessThanOrEqual(1));
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
  test.each(ALARM_SOUND_DEFINITIONS.map((s) => [s.key, s]))('%s schedules one oscillator per voice through a master gain', (key, sound) => {
    const { ctx, oscillators, gains } = makeFakeContext();
    playAlarmPattern(ctx, key);

    expect(oscillators).toHaveLength(sound.voices.length);
    // Master + eine Hüllkurve je Stimme
    expect(gains).toHaveLength(sound.voices.length + 1);
    const master = gains[0];
    expect(master.connect).toHaveBeenCalledWith(ctx.destination);
    expect(master.gain.setValueAtTime).toHaveBeenCalledWith(sound.volume, 10);

    sound.voices.forEach((voice, i) => {
      const osc = oscillators[i];
      expect(osc.type).toBe(voice.type);
      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(voice.freq, 10 + voice.at);
      expect(osc.start).toHaveBeenCalledWith(10 + voice.at);
      expect(gains[i + 1].connect).toHaveBeenCalledWith(master);
    });
  });

  test('glide voices ramp the frequency', () => {
    const { ctx, oscillators } = makeFakeContext();
    playAlarmPattern(ctx, 'zwitschern');
    expect(oscillators[0].frequency.linearRampToValueAtTime).toHaveBeenCalledWith(3900, expect.any(Number));
  });

  test('a legacy key plays the mapped sound', () => {
    const { ctx, oscillators } = makeFakeContext();
    playAlarmPattern(ctx, 'beep');
    expect(oscillators).toHaveLength(getAlarmSoundDefinition('digitaluhr').voices.length);
  });

  test('does not throw when the Audio API fails', () => {
    const ctx = { currentTime: 0, createGain: () => { throw new Error('nope'); } };
    expect(() => playAlarmPattern(ctx, 'gong')).not.toThrow();
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
  afterEach(() => {
    window.AudioContext = originalAudioContext;
    jest.useRealTimers();
  });

  test('plays once and closes the context after the sound has faded out', async () => {
    jest.useFakeTimers();
    const { ctx, oscillators } = makeFakeContext();
    window.AudioContext = jest.fn(() => ctx);

    await previewAlarmSound('gong');
    expect(oscillators).toHaveLength(getAlarmSoundDefinition('gong').voices.length);

    const durationMs = getAlarmSoundDuration('gong') * 1000;
    jest.advanceTimersByTime(durationMs);
    expect(ctx.close).not.toHaveBeenCalled();
    jest.advanceTimersByTime(400);
    expect(ctx.close).toHaveBeenCalledTimes(1);
  });
});
