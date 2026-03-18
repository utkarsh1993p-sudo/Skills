const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const TOKEN_PATH = path.join(__dirname, '../../data/google-token.json');
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/calendar/auth/callback';

  if (!clientId || clientId === 'your_google_client_id') {
    return null;
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function loadTokens() {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    }
  } catch (e) {
    // ignore
  }
  return null;
}

function saveTokens(tokens) {
  const dir = path.dirname(TOKEN_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
}

function getAuthStatus() {
  const client = getOAuth2Client();
  if (!client) return { configured: false, authenticated: false };
  const tokens = loadTokens();
  return { configured: true, authenticated: !!tokens };
}

function getAuthUrl() {
  const client = getOAuth2Client();
  if (!client) return null;
  return client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
}

async function exchangeCode(code) {
  const client = getOAuth2Client();
  if (!client) throw new Error('Google OAuth not configured');
  const { tokens } = await client.getToken(code);
  saveTokens(tokens);
  return tokens;
}

async function getCalendarClient() {
  const client = getOAuth2Client();
  if (!client) return null;
  const tokens = loadTokens();
  if (!tokens) return null;
  client.setCredentials(tokens);

  // Refresh token if expired
  client.on('tokens', (newTokens) => {
    const current = loadTokens() || {};
    saveTokens({ ...current, ...newTokens });
  });

  return google.calendar({ version: 'v3', auth: client });
}

async function getUpcomingEvents(days = 7) {
  const calendar = await getCalendarClient();
  if (!calendar) {
    return { error: 'Google Calendar not connected. Visit /api/calendar/auth/url to authenticate.' };
  }

  try {
    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: future.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 20,
    });

    const events = response.data.items.map(ev => ({
      id: ev.id,
      title: ev.summary || '(No title)',
      start: ev.start.dateTime || ev.start.date,
      end: ev.end.dateTime || ev.end.date,
      location: ev.location || null,
      description: ev.description || null,
      all_day: !ev.start.dateTime,
    }));

    return { events, count: events.length };
  } catch (err) {
    return { error: `Failed to fetch events: ${err.message}` };
  }
}

async function createEvent({ title, date, time, duration = 60, description = '', location = '' }) {
  const calendar = await getCalendarClient();
  if (!calendar) {
    return { error: 'Google Calendar not connected.' };
  }

  try {
    const start = new Date(`${date}T${time || '00:00'}:00`);
    const end = new Date(start.getTime() + duration * 60 * 1000);

    const event = {
      summary: title,
      description,
      location,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    return {
      success: true,
      id: response.data.id,
      title: response.data.summary,
      start: response.data.start.dateTime,
      link: response.data.htmlLink,
    };
  } catch (err) {
    return { error: `Failed to create event: ${err.message}` };
  }
}

module.exports = {
  getAuthStatus,
  getAuthUrl,
  exchangeCode,
  getUpcomingEvents,
  createEvent,
};
