const Anthropic = require('@anthropic-ai/sdk');
const weather = require('./weather');
const calendar = require('./calendar');
const whatsapp = require('./whatsapp');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// In-memory conversation history (per session)
let conversationHistory = [];

const SYSTEM_PROMPT = `You are JARVIS (Just A Rather Very Intelligent System), the advanced AI assistant. You speak with wit, sophistication, and occasional dry humor. You address the user as "${process.env.USER_NAME || 'sir'}".

Your capabilities include:
- Real-time weather data
- Google Calendar management (view and create events)
- WhatsApp message monitoring and sending
- General knowledge and reasoning

Guidelines:
- Be concise but intelligent. Avoid filler phrases.
- When using tools, interpret results naturally and conversationally.
- If a tool returns an error, explain it clearly and suggest a fix.
- Current date/time awareness: always use get_current_datetime when time context is needed.
- For WhatsApp, remind the user that they must scan the QR code to connect first.
- Keep responses under 3 sentences unless detail is explicitly requested.`;

const TOOLS = [
  {
    name: 'get_current_datetime',
    description: 'Get the current date, time, and day of the week.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_weather',
    description: 'Get current weather conditions for a city.',
    input_schema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name, e.g. "London" or "New York, US"' },
      },
      required: ['city'],
    },
  },
  {
    name: 'get_weather_forecast',
    description: 'Get a 5-day weather forecast for a city.',
    input_schema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' },
      },
      required: ['city'],
    },
  },
  {
    name: 'get_calendar_events',
    description: 'Retrieve upcoming calendar events from Google Calendar.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days ahead to look. Default: 7' },
      },
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Create a new event in Google Calendar.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        time: { type: 'string', description: 'Time in HH:MM format (24hr), e.g. "14:30"' },
        duration: { type: 'number', description: 'Duration in minutes. Default: 60' },
        description: { type: 'string', description: 'Optional description' },
        location: { type: 'string', description: 'Optional location' },
      },
      required: ['title', 'date'],
    },
  },
  {
    name: 'get_whatsapp_messages',
    description: 'Get recent WhatsApp messages. WhatsApp must be connected first.',
    input_schema: {
      type: 'object',
      properties: {
        contact: { type: 'string', description: 'Filter by contact name or number (optional)' },
        limit: { type: 'number', description: 'Max messages to return. Default: 10' },
      },
    },
  },
  {
    name: 'send_whatsapp_message',
    description: 'Send a WhatsApp message to a contact number.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Phone number with country code, e.g. "+1234567890"' },
        message: { type: 'string', description: 'Message text to send' },
      },
      required: ['to', 'message'],
    },
  },
];

async function executeTool(name, input) {
  switch (name) {
    case 'get_current_datetime': {
      const now = new Date();
      return {
        datetime: now.toISOString(),
        date: now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    }
    case 'get_weather':
      return await weather.getCurrentWeather(input.city);
    case 'get_weather_forecast':
      return await weather.getForecast(input.city);
    case 'get_calendar_events':
      return await calendar.getUpcomingEvents(input.days || 7);
    case 'create_calendar_event':
      return await calendar.createEvent(input);
    case 'get_whatsapp_messages':
      return { messages: whatsapp.getRecentMessages(input.contact, input.limit || 10) };
    case 'send_whatsapp_message':
      return await whatsapp.sendMessage(input.to, input.message);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function* chat(userMessage) {
  conversationHistory.push({ role: 'user', content: userMessage });

  // Agentic tool loop with streaming
  while (true) {
    const stream = await client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: conversationHistory,
    });

    let fullContent = [];
    let currentTextBlock = '';
    let currentBlockType = null;

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        currentBlockType = event.content_block.type;
        if (currentBlockType === 'text') currentTextBlock = '';
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          currentTextBlock += event.delta.text;
          yield { type: 'text', delta: event.delta.text };
        }
      } else if (event.type === 'content_block_stop') {
        if (currentBlockType === 'text' && currentTextBlock) {
          fullContent.push({ type: 'text', text: currentTextBlock });
        }
        currentBlockType = null;
        currentTextBlock = '';
      }
    }

    const finalMessage = await stream.finalMessage();

    // Rebuild full content array from final message
    fullContent = finalMessage.content;

    // Add assistant response to history
    conversationHistory.push({ role: 'assistant', content: fullContent });

    // Check if we need to execute tools
    if (finalMessage.stop_reason !== 'tool_use') {
      break;
    }

    // Execute all tool calls
    const toolResults = [];
    for (const block of fullContent) {
      if (block.type === 'tool_use') {
        yield { type: 'tool_call', tool: block.name, input: block.input };
        const result = await executeTool(block.name, block.input);
        yield { type: 'tool_result', tool: block.name, result };
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
    }

    // Feed tool results back
    conversationHistory.push({ role: 'user', content: toolResults });
  }

  yield { type: 'done' };
}

function clearHistory() {
  conversationHistory = [];
}

function getHistory() {
  return conversationHistory.filter(m => m.role === 'user' || m.role === 'assistant');
}

module.exports = { chat, clearHistory, getHistory };
