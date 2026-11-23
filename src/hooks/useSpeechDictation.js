import { useCallback, useEffect, useRef, useState } from 'react';
import { useSprache, useTexte } from '../contexts/SpracheContext';
import { localeFuer } from '../i18n/sprachen';
import diktatTexte from '../i18n/texte/diktat';

const getRecognitionClass = () => (
  typeof window === 'undefined' ? null : (window.SpeechRecognition || window.webkitSpeechRecognition || null)
);

// Fehlercodes der Web Speech API → Schlüssel in src/i18n/texte/diktat.js (Mehrsprachigkeit PR 6o)
const FEHLER_SCHLUESSEL = {
  'not-allowed': 'keinZugriff',
  'service-not-allowed': 'keinZugriff',
  'no-speech': 'nichtsVerstanden',
  'audio-capture': 'keinMikrofon',
  network: 'keineVerbindung',
};

/**
 * Diktierfunktion über die Web Speech API (Browser-Spracherkennung).
 * Fertig erkannte Textstücke werden über `onText` angehängt; Zwischenergebnisse
 * stehen in `interim`. Wo die API fehlt (z. B. Firefox), ist `supported` false —
 * die Eingabe per Tastatur (inkl. Diktat der System-Tastatur) funktioniert weiter.
 * Erkannt wird in der geltenden Sprache der App, Fehler erscheinen in ihr (seit
 * Mehrsprachigkeit PR 6o; vorher immer Deutsch).
 *
 * @param {Object} options
 * @param {(text: string) => void} options.onText - bekommt jedes fertig erkannte Stück
 * @param {string} [options.lang] - Sprache der Erkennung (BCP 47), sonst die der App (localeFuer)
 * @returns {{supported: boolean, listening: boolean, interim: string, error: string, start: Function, stop: Function}}
 */
export default function useSpeechDictation({ onText, lang }) {
  const { sprache } = useSprache();
  const t = useTexte(diktatTexte);
  const erkennungsSprache = lang || localeFuer(sprache);
  const supported = Boolean(getRecognitionClass());
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  // Schlüssel des Fehlers, übersetzt erst bei der Rückgabe (folgt so einem Sprachwechsel)
  const [fehler, setFehler] = useState('');
  const recognitionRef = useRef(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Recognition = getRecognitionClass();
    if (!Recognition || recognitionRef.current) return;
    setFehler('');
    const recognition = new Recognition();
    recognition.lang = erkennungsSprache;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let nextInterim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript || '';
        if (result.isFinal) {
          if (transcript.trim()) onTextRef.current(transcript.trim());
        } else {
          nextInterim += transcript;
        }
      }
      setInterim(nextInterim);
    };
    recognition.onerror = (event) => {
      // Vom Nutzer abgebrochen (Stopp/Abbruch) ist kein Fehler.
      if (event.error === 'aborted') return;
      setFehler(FEHLER_SCHLUESSEL[event.error] || 'fehlgeschlagen');
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      setInterim('');
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch (e) {
      recognitionRef.current = null;
      setFehler('startFehlgeschlagen');
    }
  }, [erkennungsSprache]);

  useEffect(() => () => {
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
    }
  }, []);

  return { supported, listening, interim, error: fehler ? t(fehler) : '', start, stop };
}
