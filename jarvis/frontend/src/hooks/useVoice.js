import { useState, useRef, useCallback, useEffect } from 'react';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const supported = !!SpeechRecognition && !!window.speechSynthesis;

export default function useVoice() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef(null);
  const synth = window.speechSynthesis;

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

    // Strip markdown-ish formatting
    const clean = text
      .replace(/[*_`#]/g, '')
      .replace(/\n+/g, '. ')
      .slice(0, 600); // Cap at 600 chars for TTS

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 0.95;
    utterance.pitch = 0.9;
    utterance.volume = 1;

    // Pick a deeper voice if available
    const voices = synth.getVoices();
    const preferred = voices.find(v =>
      /google uk english male|daniel|alex|fred/i.test(v.name)
    ) || voices.find(v => v.lang === 'en-GB') || voices[0];
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    synth.speak(utterance);
  }, []);

  const cancelSpeech = useCallback(() => {
    synth.cancel();
    setIsSpeaking(false);
  }, []);

  // Reset transcript when it's consumed
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
