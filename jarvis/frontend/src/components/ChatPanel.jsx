import React, { useEffect, useRef } from 'react';
import './ChatPanel.css';

export default function ChatPanel({ messages, onClear }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span className="chat-title">COMMUNICATION LOG</span>
        <button className="chat-clear-btn" onClick={onClear} title="Clear conversation">
          PURGE
        </button>
      </div>

      <div className="chat-messages">
        {messages.map(msg => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function ChatMessage({ message }) {
  const { role, content, timestamp, streaming, error, toolCalls } = message;

  const timeStr = timestamp
    ? new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';

  return (
    <div className={`chat-msg chat-msg-${role} ${error ? 'chat-msg-error' : ''}`}>
      <div className="msg-meta">
        <span className="msg-role">
          {role === 'user' ? '▶ OPERATOR' : role === 'system' ? '◈ SYSTEM' : '◆ J.A.R.V.I.S'}
        </span>
        <span className="msg-time">{timeStr}</span>
      </div>

      {toolCalls && toolCalls.length > 0 && (
        <div className="tool-calls">
          {toolCalls.map((tc, i) => (
            <span key={i} className="tool-tag">⚡ {tc.tool.toUpperCase()}</span>
          ))}
        </div>
      )}

      <div className={`msg-body ${streaming && !content ? 'msg-typing' : ''}`}>
        {content || (streaming ? '' : '')}
        {streaming && <span className="cursor-blink">█</span>}
      </div>
    </div>
  );
}
