require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const claude = require('./services/claude');
const weatherService = require('./services/weather');
const calendarService = require('./services/calendar');
const whatsappService = require('./services/whatsapp');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const path = require('path');

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

// ─── SERVE FRONTEND (production) ──────────────────────────────────────────────
const STATIC_DIR = path.join(__dirname, '../../frontend/dist');
app.use(express.static(STATIC_DIR));

// WebSocket — broadcast to all clients
const broadcast = (data) => {
  const payload = JSON.stringify(data);
  wss.clients.forEach(ws => {
    if (ws.readyState === 1) ws.send(payload);
  });
};

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  // Send current WhatsApp status on connect
  ws.send(JSON.stringify({ type: 'whatsapp_status', ...whatsappService.getStatus() }));
  ws.on('close', () => console.log('[WS] Client disconnected'));
});

// ─── CHAT (Server-Sent Events for streaming) ──────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    for await (const event of claude.chat(message)) {
      send(event);
      if (event.type === 'done') break;
    }
  } catch (err) {
    console.error('[Chat error]', err);
    send({ type: 'error', error: err.message });
  } finally {
    res.end();
  }
});

app.get('/api/history', (req, res) => {
  res.json(claude.getHistory());
});

app.delete('/api/history', (req, res) => {
  claude.clearHistory();
  res.json({ success: true });
});

// ─── WEATHER ──────────────────────────────────────────────────────────────────
app.get('/api/weather', async (req, res) => {
  const city = req.query.city || 'London';
  const data = await weatherService.getCurrentWeather(city);
  res.json(data);
});

app.get('/api/weather/forecast', async (req, res) => {
  const city = req.query.city || 'London';
  const data = await weatherService.getForecast(city);
  res.json(data);
});

// ─── CALENDAR ─────────────────────────────────────────────────────────────────
app.get('/api/calendar/status', (req, res) => {
  res.json(calendarService.getAuthStatus());
});

app.get('/api/calendar/auth/url', (req, res) => {
  const url = calendarService.getAuthUrl();
  if (!url) return res.status(503).json({ error: 'Google OAuth not configured' });
  res.json({ url });
});

app.get('/api/calendar/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');
  try {
    await calendarService.exchangeCode(code);
    res.send(`<html><body style="font-family:monospace;background:#0a0a0f;color:#00d4ff;padding:40px">
      <h2>✓ Google Calendar connected successfully.</h2>
      <p>You can close this window and return to JARVIS.</p>
    </body></html>`);
  } catch (err) {
    res.status(500).send(`Auth error: ${err.message}`);
  }
});

app.get('/api/calendar/events', async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const data = await calendarService.getUpcomingEvents(days);
  res.json(data);
});

app.post('/api/calendar/events', async (req, res) => {
  const data = await calendarService.createEvent(req.body);
  res.json(data);
});

// ─── WHATSAPP ─────────────────────────────────────────────────────────────────
app.get('/api/whatsapp/status', (req, res) => {
  res.json(whatsappService.getStatus());
});

app.post('/api/whatsapp/connect', async (req, res) => {
  res.json({ message: 'WhatsApp initialization started. Check the QR code.' });
  whatsappService.initWhatsApp(broadcast);
});

app.get('/api/whatsapp/messages', (req, res) => {
  const { contact, limit } = req.query;
  res.json({ messages: whatsappService.getRecentMessages(contact, parseInt(limit) || 20) });
});

app.post('/api/whatsapp/send', async (req, res) => {
  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ error: 'to and message required' });
  const result = await whatsappService.sendMessage(to, message);
  res.json(result);
});

// ─── SPA CATCH-ALL (must be after API routes) ────────────────────────────────
const fs = require('fs');
app.get('*', (req, res) => {
  const indexPath = path.join(STATIC_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send(`
      <html><body style="font-family:monospace;background:#030509;color:#00d4ff;padding:40px;text-align:center">
        <h2>JARVIS Backend Online</h2>
        <p style="color:#c8e8ff99">Frontend not built yet. Run: <code>cd frontend && npm run build</code></p>
      </body></html>
    `);
  }
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║  🤖 JARVIS Backend Online                     ║
║  Port: ${PORT}                                    ║
║  Model: claude-opus-4-6                       ║
╚═══════════════════════════════════════════════╝
  `);
});
