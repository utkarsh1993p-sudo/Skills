import React, { useState, useEffect, useRef, useCallback } from 'react';
import JarvisOrb from './components/JarvisOrb.jsx';
import StatusBar from './components/StatusBar.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import SidePanel from './components/SidePanel.jsx';
import useVoice from './hooks/useVoice.js';
import './App.css';

const API = '/api';

export default function App() {
  const [messages, setMessages] = useState([
    {
      id: 0,
      role: 'assistant',
      content: 'All systems online. Good to see you. How may I assist you today?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [orbState, setOrbState] = useState('idle'); // idle | listening | thinking | speaking
  const [whatsappStatus, setWhatsappStatus] = useState('disconnected');
  const [whatsappQR, setWhatsappQR] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [activePanel, setActivePanel] = useState(null); // 'calendar' | 'whatsapp' | 'weather'
  const [handsFreeMode, setHandsFreeMode] = useState(false);

  const wsRef = useRef(null);
  const inputRef = useRef(null);
  const prevIsListeningRef = useRef(false);
  const transcriptRef = useRef('');

  const { isListening, transcript, startListening, stopListening, speak, isSpeaking, supported, ttsSupported, recognitionSupported, consumeTranscript } = useVoice();

  // Keep a ref copy of transcript to avoid stale closures
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // WebSocket connection
  useEffect(() => {
    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}`);
      wsRef.current = ws;

      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => {
        setWsConnected(false);
        setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'whatsapp_status') {
            setWhatsappStatus(data.status);
            if (data.qr) setWhatsappQR(data.qr);
          } else if (data.type === 'whatsapp_qr') {
            setWhatsappQR(data.qr);
            setWhatsappStatus('qr_ready');
          } else if (data.type === 'whatsapp_message') {
            const m = data.message;
            addSystemMessage(`📱 New WhatsApp from ${m.contact_name || m.from}: "${m.body}"`);
          }
        } catch (_) {}
      };
    };
    connect();
    return () => wsRef.current?.close();
  }, []);

  // Voice transcript → input field (manual mode only)
  useEffect(() => {
    if (!handsFreeMode && transcript) setInput(transcript);
  }, [transcript, handsFreeMode]);

  // Orb state sync
  useEffect(() => {
    if (isListening) setOrbState('listening');
    else if (isSpeaking) setOrbState('speaking');
    else if (isProcessing) setOrbState('thinking');
    else setOrbState('idle');
  }, [isListening, isSpeaking, isProcessing]);

  const addSystemMessage = (content) => {
    setMessages(prev => [...prev, {
      id: Date.now(),
      role: 'system',
      content,
      timestamp: new Date(),
    }]);
  };

  const sendMessage = useCallback(async (text) => {
    const userText = text || input.trim();
    if (!userText || isProcessing) return;

    setInput('');
    setIsProcessing(true);

    const userMsg = { id: Date.now(), role: 'user', content: userText, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);

    const assistantId = Date.now() + 1;
    let assistantContent = '';
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: new Date(), streaming: true }]);

    try {
      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'text') {
              assistantContent += event.delta;
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: assistantContent } : m
              ));
            } else if (event.type === 'tool_call') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, toolCalls: [...(m.toolCalls || []), { tool: event.tool, status: 'running' }] }
                  : m
              ));
            } else if (event.type === 'done') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, streaming: false } : m
              ));
              if (assistantContent && ttsSupported) {
                speak(assistantContent);
              }
            }
          } catch (_) {}
        }
      }
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: `System error: ${err.message}`, streaming: false, error: true }
          : m
      ));
    } finally {
      setIsProcessing(false);
    }
  }, [input, isProcessing, speak, ttsSupported]);

  // Hands-free: auto-send when recognition ends with a result
  useEffect(() => {
    const wasListening = prevIsListeningRef.current;
    prevIsListeningRef.current = isListening;

    if (handsFreeMode && wasListening && !isListening) {
      const t = transcriptRef.current.trim();
      if (t) {
        sendMessage(t);
        consumeTranscript();
        setInput('');
      }
    }
  }, [isListening, handsFreeMode, consumeTranscript, sendMessage]);

  // Hands-free: auto-restart listening after Jarvis finishes speaking (or becomes idle)
  useEffect(() => {
    if (!handsFreeMode || isListening || isSpeaking || isProcessing) return;
    const t = setTimeout(startListening, 600);
    return () => clearTimeout(t);
  }, [handsFreeMode, isListening, isSpeaking, isProcessing, startListening]);

  // Turning hands-free OFF: stop any active listening
  useEffect(() => {
    if (!handsFreeMode && isListening) stopListening();
  }, [handsFreeMode]);

  const handleVoiceToggle = () => {
    if (handsFreeMode) {
      // In hands-free mode, mic button stops/starts a cycle manually
      if (isListening) stopListening();
      else startListening();
    } else {
      if (isListening) {
        stopListening();
        if (transcript) sendMessage(transcript);
      } else {
        startListening();
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearHistory = async () => {
    await fetch(`${API}/history`, { method: 'DELETE' });
    setMessages([{
      id: Date.now(),
      role: 'assistant',
      content: 'Memory wiped. Ready for new instructions.',
      timestamp: new Date(),
    }]);
  };

  return (
    <div className="jarvis-app">
      <StatusBar
        wsConnected={wsConnected}
        whatsappStatus={whatsappStatus}
        activePanel={activePanel}
        setActivePanel={setActivePanel}
      />

      <div className="main-layout">
        <div className="center-column">
          <JarvisOrb state={orbState} isListening={isListening} />

          <div className="jarvis-label">
            <span className="j-text">J.A.R.V.I.S</span>
            <span className="j-sub">JUST A RATHER VERY INTELLIGENT SYSTEM</span>
          </div>

          <div className="status-indicator">
            <span className={`dot ${orbState}`} />
            <span className="status-text">
              {orbState === 'listening' ? 'LISTENING...' :
               orbState === 'thinking' ? 'PROCESSING...' :
               orbState === 'speaking' ? 'SPEAKING...' : 'STANDBY'}
            </span>
          </div>
        </div>

        <ChatPanel
          messages={messages}
          onClear={clearHistory}
        />

        {activePanel && (
          <SidePanel
            panel={activePanel}
            whatsappStatus={whatsappStatus}
            whatsappQR={whatsappQR}
            onClose={() => setActivePanel(null)}
          />
        )}
      </div>

      <div className="input-dock">
        <div className="input-wrapper">
          <button
            className={`voice-btn ${isListening ? 'active' : ''}`}
            onClick={handleVoiceToggle}
            title={recognitionSupported ? 'Toggle voice input' : 'Microphone not supported in this browser'}
            disabled={!recognitionSupported}
          >
            <MicIcon active={isListening} />
          </button>

          <textarea
            ref={inputRef}
            className="chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={handsFreeMode ? 'Hands-free mode active — just speak...' : 'Speak or type a command, sir...'}
            rows={1}
            disabled={isProcessing}
          />

          <button
            className={`hands-free-btn ${handsFreeMode ? 'active' : ''}`}
            onClick={() => setHandsFreeMode(v => !v)}
            title={handsFreeMode ? 'Disable hands-free mode' : 'Enable hands-free mode (auto-listen)'}
            disabled={!recognitionSupported}
          >
            <HandsFreeIcon active={handsFreeMode} />
          </button>

          <button
            className={`send-btn ${isProcessing ? 'processing' : ''}`}
            onClick={() => sendMessage()}
            disabled={!input.trim() || isProcessing}
          >
            <SendIcon processing={isProcessing} />
          </button>
        </div>
        <div className="input-hint">
          {handsFreeMode
            ? 'HANDS-FREE · Jarvis listens automatically after each reply'
            : 'ENTER to send · SHIFT+ENTER for newline · Click mic icon for hands-free'}
        </div>
      </div>
    </div>
  );
}

function MicIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
      {active && <circle cx="12" cy="7" r="5" fill="currentColor" opacity="0.2" className="pulse-circle"/>}
    </svg>
  );
}

function HandsFreeIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="11" rx="4" ry="5"/>
      <path d="M3 11c0 4.97 4.03 9 9 9s9-4.03 9-9"/>
      {active && <circle cx="12" cy="11" r="8" fill="currentColor" opacity="0.15"/>}
      {active && <line x1="12" y1="20" x2="12" y2="23" strokeWidth="2.5"/>}
    </svg>
  );
}

function SendIcon({ processing }) {
  if (processing) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spin">
        <circle cx="12" cy="12" r="10" strokeDasharray="30 10"/>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}
