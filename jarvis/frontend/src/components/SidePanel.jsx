import React, { useState, useEffect } from 'react';
import './SidePanel.css';

const API = '/api';

export default function SidePanel({ panel, whatsappStatus, whatsappQR, onClose }) {
  return (
    <div className="side-panel">
      <div className="side-panel-header">
        <span className="side-panel-title">
          {panel === 'weather' ? '⛅ ATMOSPHERIC DATA' :
           panel === 'calendar' ? '📅 SCHEDULE' :
           '📱 WHATSAPP'}
        </span>
        <button className="side-close" onClick={onClose}>✕</button>
      </div>
      <div className="side-panel-body">
        {panel === 'weather' && <WeatherPanel />}
        {panel === 'calendar' && <CalendarPanel />}
        {panel === 'whatsapp' && <WhatsAppPanel status={whatsappStatus} qr={whatsappQR} />}
      </div>
    </div>
  );
}

function WeatherPanel() {
  const [city, setCity] = useState('London');
  const [search, setSearch] = useState('London');
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchWeather = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/weather?city=${encodeURIComponent(search)}`);
      const data = await res.json();
      setWeather(data);
      setCity(search);
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { fetchWeather(); }, []);

  return (
    <div className="weather-panel">
      <div className="search-row">
        <input
          className="panel-input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Enter city..."
          onKeyDown={e => e.key === 'Enter' && fetchWeather()}
        />
        <button className="panel-btn" onClick={fetchWeather} disabled={loading}>
          {loading ? '...' : '→'}
        </button>
      </div>

      {weather?.error && <div className="panel-error">{weather.error}</div>}
      {weather && !weather.error && (
        <div className="weather-data">
          <div className="weather-main">
            <img
              src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`}
              alt={weather.description}
              className="weather-icon"
            />
            <div>
              <div className="weather-temp">{weather.temperature}°C</div>
              <div className="weather-desc">{weather.description.toUpperCase()}</div>
            </div>
          </div>
          <div className="weather-city">{weather.city}, {weather.country}</div>
          <div className="weather-details">
            <DataRow label="FEELS LIKE" value={`${weather.feels_like}°C`} />
            <DataRow label="HUMIDITY" value={`${weather.humidity}%`} />
            <DataRow label="WIND" value={`${weather.wind_speed} km/h`} />
            {weather.visibility && <DataRow label="VISIBILITY" value={`${weather.visibility} km`} />}
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarPanel() {
  const [events, setEvents] = useState(null);
  const [authStatus, setAuthStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/calendar/status`).then(r => r.json()),
      fetch(`${API}/calendar/events`).then(r => r.json()),
    ]).then(([status, evs]) => {
      setAuthStatus(status);
      setEvents(evs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const openAuth = async () => {
    const res = await fetch(`${API}/calendar/auth/url`);
    const data = await res.json();
    if (data.url) window.open(data.url, '_blank');
  };

  if (loading) return <div className="panel-loading">LOADING...</div>;

  if (!authStatus?.configured) return (
    <div className="panel-info">
      <p>Google Calendar not configured.</p>
      <p style={{ marginTop: '8px', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
        Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file.
      </p>
    </div>
  );

  if (!authStatus?.authenticated) return (
    <div className="panel-info">
      <p>Connect your Google Calendar to see events.</p>
      <button className="panel-btn-full" onClick={openAuth}>CONNECT GOOGLE CALENDAR</button>
    </div>
  );

  return (
    <div className="calendar-panel">
      <div className="calendar-header">NEXT 7 DAYS — {events?.count || 0} EVENTS</div>
      {events?.error && <div className="panel-error">{events.error}</div>}
      {events?.events?.length === 0 && <div className="panel-info">No upcoming events.</div>}
      {events?.events?.map(ev => (
        <div key={ev.id} className="event-card">
          <div className="event-title">{ev.title}</div>
          <div className="event-time">
            {new Date(ev.start).toLocaleString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })}
          </div>
          {ev.location && <div className="event-location">📍 {ev.location}</div>}
        </div>
      ))}
    </div>
  );
}

function WhatsAppPanel({ status, qr }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (status === 'ready') {
      fetch(`${API}/whatsapp/messages?limit=20`)
        .then(r => r.json())
        .then(d => setMessages(d.messages || []));
    }
  }, [status]);

  const connect = () => fetch(`${API}/whatsapp/connect`, { method: 'POST' });

  const statusColors = { ready: '#00ff88', qr_ready: '#ffaa00', connecting: '#ffaa00', disconnected: '#ff3366', error: '#ff3366' };
  const color = statusColors[status] || '#ff3366';

  return (
    <div className="whatsapp-panel">
      <div className="wa-status">
        <span className="wa-dot" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
        <span style={{ color }}>{status.toUpperCase().replace('_', ' ')}</span>
      </div>

      {status === 'disconnected' && (
        <button className="panel-btn-full" onClick={connect}>INITIALIZE WHATSAPP</button>
      )}

      {qr && status === 'qr_ready' && (
        <div className="qr-container">
          <p className="qr-label">SCAN WITH WHATSAPP</p>
          <img src={qr} alt="WhatsApp QR Code" className="qr-img" />
        </div>
      )}

      {status === 'ready' && (
        <div className="wa-messages">
          <div className="wa-messages-title">RECENT MESSAGES ({messages.length})</div>
          {messages.length === 0 && <div className="panel-info">No messages received yet.</div>}
          {messages.map(m => (
            <div key={m.id} className="wa-msg">
              <div className="wa-msg-from">{m.contact_name || m.from}</div>
              <div className="wa-msg-body">{m.body}</div>
              <div className="wa-msg-time">{m.time}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DataRow({ label, value }) {
  return (
    <div className="data-row">
      <span className="data-label">{label}</span>
      <span className="data-value">{value}</span>
    </div>
  );
}
