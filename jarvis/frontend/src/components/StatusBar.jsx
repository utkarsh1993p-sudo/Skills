import React, { useState, useEffect } from 'react';
import './StatusBar.css';

export default function StatusBar({ wsConnected, whatsappStatus, activePanel, setActivePanel }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const togglePanel = (panel) => setActivePanel(activePanel === panel ? null : panel);

  const waColor = whatsappStatus === 'ready' ? '#00ff88' : whatsappStatus === 'qr_ready' ? '#ffaa00' : '#ff3366';

  return (
    <div className="status-bar">
      <div className="status-left">
        <div className="status-brand">JARVIS <span>v2.0</span></div>
        <div className={`status-chip ${wsConnected ? 'ok' : 'err'}`}>
          <span className="chip-dot" />
          {wsConnected ? 'ONLINE' : 'RECONNECTING'}
        </div>
      </div>

      <div className="status-center">
        <div className="status-clock">
          {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
        <div className="status-date">
          {time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      </div>

      <div className="status-right">
        <button
          className={`status-btn ${activePanel === 'weather' ? 'active' : ''}`}
          onClick={() => togglePanel('weather')}
          title="Weather"
        >
          <span>⛅</span> WEATHER
        </button>
        <button
          className={`status-btn ${activePanel === 'calendar' ? 'active' : ''}`}
          onClick={() => togglePanel('calendar')}
          title="Calendar"
        >
          <span>📅</span> CALENDAR
        </button>
        <button
          className={`status-btn ${activePanel === 'whatsapp' ? 'active' : ''}`}
          onClick={() => togglePanel('whatsapp')}
          title="WhatsApp"
          style={{ '--chip-color': waColor }}
        >
          <span style={{ color: waColor }}>●</span> WHATSAPP
        </button>
      </div>
    </div>
  );
}
