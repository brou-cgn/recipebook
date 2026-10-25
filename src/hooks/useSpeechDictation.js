import { useCallback, useEffect, useRef, useState } from 'react';

const getRecognitionClass = () => (
  typeof window === 'undefined' ? null : (window.SpeechRecognition || window.webkitSpeechRecognition || null)
);

const ERROR_MESSAGES = {
  'not-allowed': 'Mikrofonzugriff nicht erlaubt. Bitte in den Browser-Einstellungen freigeben.',
  'service-not-allowed': 'Mikrofonzugriff nicht erlaubt. Bitte in den Browser-Einstellungen freigeben.',
  'no-speech': 'Es wurde nichts verstanden. Bitte versuche es noch einmal.',
  'audio-capture': 'Es wurde kein Mikrofon gefunden.',
  network: 'Die Spracherkennung braucht eine Internetverbindung.',
};

/**
 * Diktierfunktion über die Web Speech API (Browser-Spracherkennung, Deutsch).
 * Fertig erkannte Textstücke werden über `onText` angehängt; Zwischenergebnisse
 * stehen in `interim`. Wo die API fehlt (z. B. Firefox), ist `supported` false —
 * die Eingabe per Tastatur (inkl. Diktat der System-Tastatur) funktioniert weiter.
 *
 * @param {Object} options
 * @param {(text: string) => void} options.onText - bekommt jedes fertig erkannte Stück
 * @param {string} [options.lang='de-DE']
 * @returns {{supported: boolean, listening: boolean, interim: string, error: string, start: Function, stop: Function}}
 */
export default function useSpeechDictation({ onText, lang = 'de-DE' }) {
  const supported = Boolean(getRecognitionClass());
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const recognitionRef = useRef(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Recognition = getRecognitionClass();
    if (!Recognition || recognitionRef.current) return;
    setError('');
    const recognition = new Recognition();
    recognition.lang = lang;
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
      setError(ERROR_MESSAGES[event.error] || 'Die Spracherkennung ist fehlgeschlagen.');
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
      setError('Die Spracherkennung konnte nicht gestartet werden.');
    }
  }, [lang]);

  useEffect(() => () => {
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
    }
  }, []);

  return { supported, listening, interim, error, start, stop };
}
