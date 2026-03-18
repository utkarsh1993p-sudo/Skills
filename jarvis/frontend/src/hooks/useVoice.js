import { useState, useRef, useCallback, useEffect } from 'react';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const supported = !!SpeechRecognition && !!window.speechSynthesis;

export default function useVoice() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef(null);
  const voicesRef = useRef([]);
  const synth = window.speechSynthesis;

  // Chrome loads voices asynchronously — pre-load them
  useEffect(() => {
    const load = () => { voicesRef.current = synth.getVoices(); };
    load();
    synth.addEventListener('voiceschanged', load);
    return () => synth.removeEventListener('voiceschanged', load);
  }, []);

  const startListening = useCallback(() => {
    if (!supported) return;

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
    if (!supported || !text) return;

    synth.cancel();

    const clean = text
      .replace(/[*_`#]/g, '')
      .replace(/\n+/g, '. ')
      .slice(0, 600);

    // Chrome bug: cancel() must settle before speak() works reliably
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 0.95;
      utterance.pitch = 0.9;
      utterance.volume = 1;

      const voices = voicesRef.current;
      const preferred = voices.find(v =>
        /google uk english male|daniel|alex|fred/i.test(v.name)
      ) || voices.find(v => v.lang === 'en-GB') || voices[0];
      if (preferred) utterance.voice = preferred;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      synth.speak(utterance);
    }, 100);
  }, []);

  const cancelSpeech = useCallback(() => {
    synth.cancel();
    setIsSpeaking(false);
  }, []);

  const consumeTranscript = useCallback(() => setTranscript(''), []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      synth.cancel();
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
    consumeTranscript,
  };
}
