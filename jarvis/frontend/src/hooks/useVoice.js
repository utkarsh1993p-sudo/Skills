import { useState, useRef, useCallback, useEffect } from 'react';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognitionSupported = !!SpeechRecognition;
const ttsSupported = !!window.speechSynthesis;
// legacy export: true only if both work (used for mic button disabled state)
const supported = recognitionSupported && ttsSupported;

export default function useVoice() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef(null);
  const voicesRef = useRef([]);
  const keepAliveRef = useRef(null);

  // Chrome loads voices asynchronously — pre-load them
  useEffect(() => {
    if (!ttsSupported) return;
    const load = () => { voicesRef.current = window.speechSynthesis.getVoices(); };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionSupported) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognition.onresult = (e) => {
      const result = Array.from(e.results)
        .map(r => r[0].transcript)
        .join('');
      setTranscript(result);
    };

    try {
      recognition.start();
    } catch (_) {}
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const speak = useCallback((text) => {
    if (!ttsSupported || !text) return;

    const synth = window.speechSynthesis;

    // Clear any existing keepalive
    clearInterval(keepAliveRef.current);

    synth.cancel();

    const clean = text
      .replace(/[*_`#]/g, '')
      .replace(/\n+/g, '. ')
      .slice(0, 600);

    // Chrome needs a tick after cancel() before speak() works reliably
    setTimeout(() => {
      // Chrome bug: synthesis can get stuck in paused state
      if (synth.paused) synth.resume();

      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 0.95;
      utterance.pitch = 0.9;
      utterance.volume = 1;

      // Use cached voices, fall back to live query
      const voices = voicesRef.current.length ? voicesRef.current : synth.getVoices();
      const preferred = voices.find(v =>
        /google uk english male|daniel|alex|fred/i.test(v.name)
      ) || voices.find(v => v.lang === 'en-GB') || voices[0];
      if (preferred) utterance.voice = preferred;

      utterance.onstart = () => {
        setIsSpeaking(true);
        // Chrome silently stops TTS after ~15s without this keepalive
        keepAliveRef.current = setInterval(() => {
          if (!synth.speaking) { clearInterval(keepAliveRef.current); return; }
          synth.pause();
          synth.resume();
        }, 10000);
      };

      utterance.onend = () => {
        clearInterval(keepAliveRef.current);
        setIsSpeaking(false);
      };

      utterance.onerror = (e) => {
        clearInterval(keepAliveRef.current);
        setIsSpeaking(false);
        console.warn('TTS error:', e.error);
      };

      synth.speak(utterance);
    }, 150);
  }, []);

  const cancelSpeech = useCallback(() => {
    clearInterval(keepAliveRef.current);
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const consumeTranscript = useCallback(() => setTranscript(''), []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      clearInterval(keepAliveRef.current);
      window.speechSynthesis.cancel();
    };
  }, []);

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
    speak,
    cancelSpeech,
    isSpeaking,
    supported,
    ttsSupported,
    recognitionSupported,
    consumeTranscript,
  };
}
